package com.spotchzxk.application;

import com.spotchzxk.domain.dividend.repository.DividendLogRepository;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.UserDividendLogRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DividendServiceTest {

    @Test
    void paysDividendWithoutRelyingOnRoundedPerShareRate() {
        UserShareRepository userShareRepository = mock(UserShareRepository.class);
        UserDividendLogRepository userDividendLogRepository = mock(UserDividendLogRepository.class);
        DividendLogRepository dividendLogRepository = mock(DividendLogRepository.class);
        StockRepository stockRepository = mock(StockRepository.class);
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        TradeEngine tradeEngine = mock(TradeEngine.class);
        Stock stock = mock(Stock.class);

        BigDecimal eligibleShares =
                new BigDecimal("500000000000000000000000000000000000000");
        BigDecimal totalPayout = new BigDecimal("14000000000000000000000");

        when(stock.getChannelId()).thenReturn("jabin");
        when(stock.getStreamerName()).thenReturn("자빈123");
        when(stock.getProfileImageUrl()).thenReturn("");
        when(stock.getFeePool()).thenReturn(new BigInteger("40000000000000000000000"));
        when(stockRepository.findById("jabin")).thenReturn(Optional.of(stock));
        when(userShareRepository.sumPreStreamQuantityByChannel("jabin")).thenReturn(eligibleShares);
        when(userShareRepository.distributeDividends("jabin", totalPayout, eligibleShares)).thenReturn(1);
        when(userShareRepository.findByStockChannelIdWithPositivePreStreamQuantity("jabin")).thenReturn(List.of());

        DividendService service = new DividendService(
                userShareRepository,
                userDividendLogRepository,
                dividendLogRepository,
                stockRepository,
                messagingTemplate,
                tradeEngine
        );

        DividendPayoutResult result = service.payIntervalDividend(stock);

        assertThat(result).isEqualTo(DividendPayoutResult.paid());
        verify(userShareRepository).distributeDividends("jabin", totalPayout, eligibleShares);
        verify(stock).drainFeePool(new BigInteger("14000000000000000000000"));
        verify(stockRepository).save(stock);
    }

    @Test
    void skipsDividendWhenNoEligibleShares() {
        UserShareRepository userShareRepository = mock(UserShareRepository.class);
        UserDividendLogRepository userDividendLogRepository = mock(UserDividendLogRepository.class);
        DividendLogRepository dividendLogRepository = mock(DividendLogRepository.class);
        StockRepository stockRepository = mock(StockRepository.class);
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        TradeEngine tradeEngine = mock(TradeEngine.class);
        Stock stock = mock(Stock.class);

        when(stock.getChannelId()).thenReturn("jabin");
        when(stockRepository.findById("jabin")).thenReturn(Optional.of(stock));
        when(userShareRepository.sumPreStreamQuantityByChannel("jabin")).thenReturn(BigDecimal.ZERO);

        DividendService service = new DividendService(
                userShareRepository,
                userDividendLogRepository,
                dividendLogRepository,
                stockRepository,
                messagingTemplate,
                tradeEngine
        );

        DividendPayoutResult result = service.payIntervalDividend(stock);

        assertThat(result).isEqualTo(DividendPayoutResult.skipped(
                DividendPayoutResult.Reason.NO_ELIGIBLE_SHARES));
        verify(userShareRepository, never()).distributeDividends("jabin", BigDecimal.ZERO, BigDecimal.ZERO);
    }

    @Test
    void skipsDividendWhenFeePoolIsEmpty() {
        UserShareRepository userShareRepository = mock(UserShareRepository.class);
        UserDividendLogRepository userDividendLogRepository = mock(UserDividendLogRepository.class);
        DividendLogRepository dividendLogRepository = mock(DividendLogRepository.class);
        StockRepository stockRepository = mock(StockRepository.class);
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        TradeEngine tradeEngine = mock(TradeEngine.class);
        Stock stock = mock(Stock.class);

        when(stock.getChannelId()).thenReturn("jabin");
        when(stock.getFeePool()).thenReturn(BigInteger.ZERO);
        when(stockRepository.findById("jabin")).thenReturn(Optional.of(stock));
        when(userShareRepository.sumPreStreamQuantityByChannel("jabin")).thenReturn(BigDecimal.TEN);

        DividendService service = new DividendService(
                userShareRepository,
                userDividendLogRepository,
                dividendLogRepository,
                stockRepository,
                messagingTemplate,
                tradeEngine
        );

        DividendPayoutResult result = service.payIntervalDividend(stock);

        assertThat(result).isEqualTo(DividendPayoutResult.skipped(
                DividendPayoutResult.Reason.EMPTY_FEE_POOL));
        verify(userShareRepository, never()).distributeDividends("jabin", BigDecimal.ZERO, BigDecimal.TEN);
    }

    @Test
    void skipsDividendWhenTotalPayoutRoundsToZero() {
        UserShareRepository userShareRepository = mock(UserShareRepository.class);
        UserDividendLogRepository userDividendLogRepository = mock(UserDividendLogRepository.class);
        DividendLogRepository dividendLogRepository = mock(DividendLogRepository.class);
        StockRepository stockRepository = mock(StockRepository.class);
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        TradeEngine tradeEngine = mock(TradeEngine.class);
        Stock stock = mock(Stock.class);

        when(stock.getChannelId()).thenReturn("jabin");
        when(stock.getFeePool()).thenReturn(BigInteger.TWO);
        when(stockRepository.findById("jabin")).thenReturn(Optional.of(stock));
        when(userShareRepository.sumPreStreamQuantityByChannel("jabin")).thenReturn(BigDecimal.TEN);

        DividendService service = new DividendService(
                userShareRepository,
                userDividendLogRepository,
                dividendLogRepository,
                stockRepository,
                messagingTemplate,
                tradeEngine
        );

        DividendPayoutResult result = service.payIntervalDividend(stock);

        assertThat(result).isEqualTo(DividendPayoutResult.skipped(
                DividendPayoutResult.Reason.ZERO_TOTAL_PAYOUT));
        verify(userShareRepository, never()).distributeDividends("jabin", BigDecimal.ZERO, BigDecimal.TEN);
    }

    @Test
    void failsDividendWhenNoUsersAreUpdated() {
        UserShareRepository userShareRepository = mock(UserShareRepository.class);
        UserDividendLogRepository userDividendLogRepository = mock(UserDividendLogRepository.class);
        DividendLogRepository dividendLogRepository = mock(DividendLogRepository.class);
        StockRepository stockRepository = mock(StockRepository.class);
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        TradeEngine tradeEngine = mock(TradeEngine.class);
        Stock stock = mock(Stock.class);

        BigDecimal eligibleShares = BigDecimal.TEN;
        BigDecimal totalPayout = BigDecimal.valueOf(35);
        when(stock.getChannelId()).thenReturn("jabin");
        when(stock.getFeePool()).thenReturn(BigInteger.valueOf(100));
        when(stockRepository.findById("jabin")).thenReturn(Optional.of(stock));
        when(userShareRepository.sumPreStreamQuantityByChannel("jabin")).thenReturn(eligibleShares);
        when(userShareRepository.distributeDividends("jabin", totalPayout, eligibleShares)).thenReturn(0);

        DividendService service = new DividendService(
                userShareRepository,
                userDividendLogRepository,
                dividendLogRepository,
                stockRepository,
                messagingTemplate,
                tradeEngine
        );

        DividendPayoutResult result = service.payIntervalDividend(stock);

        assertThat(result).isEqualTo(DividendPayoutResult.failed(
                DividendPayoutResult.Reason.NO_USERS_UPDATED));
        verify(stock, never()).drainFeePool(BigInteger.valueOf(35));
        verify(stockRepository, never()).save(stock);
    }
}
