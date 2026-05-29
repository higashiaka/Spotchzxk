package com.spotchzxk.service.bot;

import com.spotchzxk.dto.TradeRequest;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.entity.User;
import com.spotchzxk.entity.UserShare;
import com.spotchzxk.repository.OrderRepository;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserRepository;
import com.spotchzxk.repository.UserShareRepository;
import com.spotchzxk.service.TradeEngine;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BotActivityServiceTest {

    private final BotActivityProperties properties = new BotActivityProperties();
    private final StockRepository stockRepository = mock(StockRepository.class);
    private final OrderRepository orderRepository = mock(OrderRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final UserShareRepository userShareRepository = mock(UserShareRepository.class);
    private final TradeEngine tradeEngine = mock(TradeEngine.class);

    private final BotActivityService service = new BotActivityService(
            properties,
            stockRepository,
            orderRepository,
            userRepository,
            userShareRepository,
            tradeEngine
    );

    @Test
    void tickDoesNothingWhenDisabled() {
        properties.setEnabled(false);

        service.tick();

        verify(stockRepository, never()).findAll();
    }

    @Test
    void botUserIdsUseStableActivityPrefix() {
        assertThat(service.botUserId(1)).isEqualTo("bot_activity_001");
        assertThat(service.botUserId(20)).isEqualTo("bot_activity_020");
    }

    @Test
    void botWithoutHoldingsOnlyBuys() {
        when(userShareRepository.findByUserIdAndStockChannelId("bot_activity_001", "stock-1"))
                .thenReturn(Optional.empty());

        String tradeType = service.pickTradeType("bot_activity_001", "stock-1");

        assertThat(tradeType).isEqualTo("buy");
    }

    @Test
    void configuredBuyChanceCanForceSellWhenBotHasHoldings() {
        properties.setBuyChancePercent(0);
        when(userShareRepository.findByUserIdAndStockChannelId("bot_activity_001", "stock-1"))
                .thenReturn(Optional.of(com.spotchzxk.entity.UserShare.builder()
                        .quantity(1)
                        .build()));

        String tradeType = service.pickTradeType("bot_activity_001", "stock-1");

        assertThat(tradeType).isEqualTo("sell");
    }

    @Test
    void lowBalanceCanReduceBuyChanceWhenBotHasHoldings() {
        properties.setBuyChancePercent(60);
        properties.setLowBalanceBuyChancePercent(0);

        String tradeType = service.pickTradeType(BigDecimal.valueOf(250_000), 5);

        assertThat(tradeType).isEqualTo("sell");
    }

    @Test
    void criticalBalanceForcesSellWhenBotHasHoldings() {
        properties.setBuyChancePercent(100);

        String tradeType = service.pickTradeType(BigDecimal.valueOf(100_000), 5);

        assertThat(tradeType).isEqualTo("sell");
    }

    @Test
    void highHoldingCanReduceBuyChance() {
        properties.setBuyChancePercent(60);
        properties.setHighHoldingQuantity(30);
        properties.setHighHoldingBuyChancePercent(0);

        String tradeType = service.pickTradeType(BigDecimal.valueOf(1_000_000), 30);

        assertThat(tradeType).isEqualTo("sell");
    }

    @Test
    void liveStocksReceiveSelectionBonus() {
        Stock inactive = stock("inactive", false);
        Stock live = stock("live", true);

        assertThat(service.baseScoreStock(live, Map.of()))
                .isGreaterThan(service.baseScoreStock(inactive, Map.of()));
    }

    @Test
    void recentBotTradesReduceSelectionScore() {
        Stock stock = stock("stock-1", true);  // non-live base score is already at minimum (1), so penalty has no effect

        assertThat(service.baseScoreStock(stock, Map.of("stock-1", 3L)))
                .isLessThan(service.baseScoreStock(stock, Map.of()));
    }

    @Test
    void lowBalanceBotPicksHeldStockFirst() {
        Stock held = stock("held", false);
        Stock unheldLive = stock("unheld-live", true);
        when(userRepository.findById("bot_activity_001"))
                .thenReturn(Optional.of(User.builder()
                        .id("bot_activity_001")
                        .coinBalance(BigDecimal.valueOf(3_000))
                        .isBot(true)
                        .build()));
        when(userShareRepository.findByUserIdWithPositiveQuantityAndStock("bot_activity_001"))
                .thenReturn(List.of(UserShare.builder()
                        .stock(held)
                        .quantity(5)
                        .build()));

        Stock picked = service.pickStockForBot(
                "bot_activity_001",
                List.of(unheldLive, held),
                Map.of()
        );

        assertThat(picked.getChannelId()).isEqualTo("held");
    }

    @Test
    void botBelowAssetResetThresholdLiquidatesHoldingsBeforeReset() {
        properties.setAssetResetThresholdPercent(50);
        Stock held = stock("held", false);
        User bot = User.builder()
                .id("bot_activity_001")
                .coinBalance(BigDecimal.valueOf(100_000))
                .isBot(true)
                .build();
        when(userRepository.findById("bot_activity_001")).thenReturn(Optional.of(bot));
        when(userShareRepository.findByUserIdWithPositiveQuantityAndStock("bot_activity_001"))
                .thenReturn(List.of(UserShare.builder()
                        .user(bot)
                        .stock(held)
                        .quantity(8)
                        .build()));

        boolean handled = service.handleBotAssetRecovery(
                "bot_activity_001",
                List.of(held),
                Map.of()
        );

        ArgumentCaptor<TradeRequest> request = ArgumentCaptor.forClass(TradeRequest.class);
        verify(tradeEngine).submitTrade(request.capture());
        assertThat(handled).isTrue();
        assertThat(request.getValue().getType()).isEqualTo("sell");
        assertThat(request.getValue().getStreamerId()).isEqualTo("held");
        assertThat(request.getValue().getQuantity()).isBetween(1, 8);
    }

    @Test
    void botBelowAssetResetThresholdResetsAfterAllHoldingsSold() {
        properties.setAssetResetThresholdPercent(50);
        User bot = User.builder()
                .id("bot_activity_001")
                .coinBalance(BigDecimal.valueOf(100_000))
                .realizedProfit(BigDecimal.valueOf(-50_000))
                .isBot(true)
                .build();
        when(userRepository.findById("bot_activity_001")).thenReturn(Optional.of(bot));
        when(userShareRepository.findByUserIdWithPositiveQuantityAndStock("bot_activity_001"))
                .thenReturn(List.of());

        boolean handled = service.handleBotAssetRecovery(
                "bot_activity_001",
                List.of(stock("unused", false)),
                Map.of()
        );

        assertThat(handled).isTrue();
        assertThat(bot.getCoinBalance()).isEqualByComparingTo(BigDecimal.valueOf(1_000_000));
        assertThat(bot.getRealizedProfit()).isEqualByComparingTo(BigDecimal.ZERO);
        verify(userRepository).save(bot);
        verify(tradeEngine).evictUserCache("bot_activity_001");
        verify(tradeEngine, never()).submitTrade(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void quantityDoesNotExceedConfiguredOrAllowedMaximum() {
        properties.setMaxQuantity(12);

        for (int i = 0; i < 100; i++) {
            assertThat(service.pickQuantity(3)).isBetween(1, 3);
        }
    }

    @Test
    void propertiesValidationRejectsReversedBalanceThresholds() {
        BotActivityProperties invalid = new BotActivityProperties();
        invalid.setLowBalanceThresholdPercent(5);
        invalid.setCriticalBalanceThresholdPercent(20);

        assertThatThrownBy(invalid::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("low-balance-threshold-percent");
    }

    @Test
    void largeQuantityChanceCanBeDisabled() {
        properties.setMaxQuantity(12);
        properties.setSmallQuantityMax(5);
        properties.setLargeQuantityChancePercent(0);

        for (int i = 0; i < 100; i++) {
            assertThat(service.pickQuantity(12)).isBetween(1, 5);
        }
    }

    private Stock stock(String channelId, boolean live) {
        return Stock.builder()
                .channelId(channelId)
                .streamerName(channelId)
                .currentPrice(1_000)
                .totalSupply(10_000)
                .issuedShares(0)
                .dailyVolume(0)
                .basePrice(1_000)
                .isLive(live)
                .build();
    }
}
