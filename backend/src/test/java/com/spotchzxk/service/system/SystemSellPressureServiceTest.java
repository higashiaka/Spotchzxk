package com.spotchzxk.service.system;

import com.spotchzxk.dto.TradeRequest;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.entity.User;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserRepository;
import com.spotchzxk.repository.UserShareRepository;
import com.spotchzxk.service.TradeEngine;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SystemSellPressureServiceTest {

    private final SystemSellPressureProperties properties = new SystemSellPressureProperties();
    private final StockRepository stockRepository = mock(StockRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final UserShareRepository userShareRepository = mock(UserShareRepository.class);
    private final TradeEngine tradeEngine = mock(TradeEngine.class);

    private final SystemSellPressureService service = new SystemSellPressureService(
            properties,
            stockRepository,
            userRepository,
            userShareRepository,
            tradeEngine
    );

    @BeforeEach
    void setUp() {
        properties.setStartGainMinPercent(250);
        properties.setStartGainMaxPercent(250);
        properties.setStopGainMinPercent(120);
        properties.setStopGainMaxPercent(120);
        properties.setExecutionChancePercent(100);
        properties.setDailyReferenceRatioMinPercent(60);
        properties.setDailyReferenceRatioMaxPercent(60);
        properties.setDailySellLimitMin(1_000);
        properties.setDailySellLimitMax(1_000);
        properties.setHighPriceTriggerMin(1_000_000);
        properties.setHighPriceTriggerMax(1_000_000);
        properties.setHighPriceStopRatioMinPercent(80);
        properties.setHighPriceStopRatioMaxPercent(80);
        properties.setHighPriceReferenceDivisorMin(10);
        properties.setHighPriceReferenceDivisorMax(10);
        properties.setMaxQuantityPerOrder(1_000);
        properties.getWeak().setQuantityMin(10);
        properties.getWeak().setQuantityMax(10);
        properties.getWeak().setIntervalMinSeconds(1);
        properties.getWeak().setIntervalMaxSeconds(1);

        when(userRepository.findById(SystemSellPressureService.SYSTEM_SELL_USER_ID))
                .thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(userShareRepository.findByUserIdAndStockChannelId(
                SystemSellPressureService.SYSTEM_SELL_USER_ID, "hot"))
                .thenReturn(Optional.empty());
    }

    @Test
    void tickDoesNothingWhenDisabled() {
        properties.setEnabled(false);

        service.tick();

        verify(stockRepository, never()).findAll();
    }

    @Test
    void gainUsesListingPriceAsReference() {
        assertThat(service.gainPercent(stock("hot", 1_000, 4_000))).isEqualTo(300);
    }

    @Test
    void dailyBasePriceCanRaiseListingReferenceForLongRunningOverheatedStock() {
        Stock stock = Stock.builder()
                .channelId("hot")
                .streamerName("hot")
                .listingPrice(10_000)
                .basePrice(1_000_000)
                .currentPrice(1_000_000)
                .totalSupply(10_000)
                .issuedShares(0)
                .dailyVolume(0)
                .isLive(false)
                .build();

        long now = System.currentTimeMillis();
        SystemSellPressureService.PressureState state = service.stateFor("hot", now);

        assertThat(service.referencePrice(stock, state)).isEqualTo(600_000);
        assertThat(service.gainPercent(stock, state)).isEqualTo(66);
    }

    @Test
    void highPricePressureUsesRandomizedSyntheticReferenceForStrengthOnly() {
        long now = System.currentTimeMillis();
        SystemSellPressureService.PressureState state = service.stateFor("hot", now);
        state.highPriceActive = true;

        assertThat(service.effectiveGainPercent(stock("hot", 1_200_000, 1_200_000), state, 0))
                .isEqualTo(900);
    }

    @Test
    void belowStartThresholdDoesNotSell() {
        long now = System.currentTimeMillis();
        SystemSellPressureService.PressureState state = service.stateFor("hot", now);
        state.nextRunAtMs = now;

        boolean sold = service.runStockIfDue(stock("hot", 1_000, 2_000), now);

        assertThat(sold).isFalse();
        verify(tradeEngine, never()).submitTrade(any());
    }

    @Test
    void highPriceAloneDoesNotStartPressureWhenBaseGainIsBelowStart() {
        long now = System.currentTimeMillis();
        SystemSellPressureService.PressureState state = service.stateFor("hot", now);
        state.nextRunAtMs = now;

        boolean sold = service.runStockIfDue(stock("hot", 1_200_000, 1_200_000), now);

        assertThat(sold).isFalse();
        assertThat(state.active).isFalse();
        assertThat(state.highPriceActive).isTrue();
        verify(tradeEngine, never()).submitTrade(any());
    }

    @Test
    void overheatedStockSubmitsSystemMarketSell() {
        long now = System.currentTimeMillis();
        SystemSellPressureService.PressureState state = service.stateFor("hot", now);
        state.nextRunAtMs = now;

        boolean sold = service.runStockIfDue(stock("hot", 1_000, 5_000), now);

        ArgumentCaptor<TradeRequest> request = ArgumentCaptor.forClass(TradeRequest.class);
        verify(tradeEngine).submitTrade(request.capture());
        assertThat(sold).isTrue();
        assertThat(request.getValue().getUserId()).isEqualTo(SystemSellPressureService.SYSTEM_SELL_USER_ID);
        assertThat(request.getValue().getStreamerId()).isEqualTo("hot");
        assertThat(request.getValue().getType()).isEqualTo("sell");
        assertThat(request.getValue().getOrderMode()).isEqualTo("market");
        assertThat(request.getValue().getQuantity()).isEqualTo(10);
    }

    @Test
    void activePressureStopsBelowStopThreshold() {
        long now = System.currentTimeMillis();
        SystemSellPressureService.PressureState state = service.stateFor("hot", now);
        state.active = true;
        state.nextRunAtMs = now;

        boolean sold = service.runStockIfDue(stock("hot", 1_000, 2_000), now);

        assertThat(sold).isFalse();
        assertThat(state.active).isFalse();
        verify(tradeEngine, never()).submitTrade(any());
    }

    @Test
    void pickQuantityIsLimitedByDailyRemainingOnly() {
        long now = System.currentTimeMillis();
        SystemSellPressureService.PressureState state = service.stateFor("hot", now);
        state.dailySellLimit = 15;
        state.soldToday = 10;

        int quantity = service.pickQuantity(stock("hot", 1_000, 5_000), 400, state);

        assertThat(quantity).isEqualTo(5);
    }

    @Test
    void pickQuantityIsCappedAtPerOrderLimit() {
        properties.setDailySellLimitMin(5_000);
        properties.setDailySellLimitMax(5_000);
        properties.getExtreme().setQuantityMin(1_500);
        properties.getExtreme().setQuantityMax(1_500);
        long now = System.currentTimeMillis();
        SystemSellPressureService.PressureState state = service.stateFor("hot", now);
        state.dailySellLimit = 5_000;

        int quantity = service.pickQuantity(stock("hot", 1_000, 20_000), 1_900, state);

        assertThat(quantity).isEqualTo(1_000);
    }

    @Test
    void propertiesValidationRejectsOverlappingStartAndStopRanges() {
        SystemSellPressureProperties invalid = new SystemSellPressureProperties();
        invalid.setStartGainMinPercent(200);
        invalid.setStopGainMaxPercent(200);

        assertThatThrownBy(invalid::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("stop gain max");
    }

    private Stock stock(String channelId, int basePrice, int currentPrice) {
        return Stock.builder()
                .channelId(channelId)
                .streamerName(channelId)
                .listingPrice(basePrice)
                .basePrice(basePrice)
                .currentPrice(currentPrice)
                .totalSupply(10_000)
                .issuedShares(0)
                .dailyVolume(0)
                .isLive(false)
                .build();
    }
}
