package com.spotchzxk.service;

import com.spotchzxk.entity.Stock;
import com.spotchzxk.repository.OrderRepository;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserRepository;
import com.spotchzxk.repository.UserShareRepository;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TradeEnginePricingTest {

    // 테스트용 풀: price = 10,000원, shareReserve = 10,000주
    private static final long COIN_RESERVE  = 100_000_000L; // 1억
    private static final long SHARE_RESERVE = 10_000L;

    @Test
    void buySlippage_avgPriceExceedsInitialPrice() {
        AmmCalculator.AmmResult result = AmmCalculator.calcBuy(COIN_RESERVE, SHARE_RESERVE, 700);

        // 평균 체결가 > 초기가 (슬리피지)
        assertThat(result.avgPrice()).isGreaterThan(BigDecimal.valueOf(10_000));
        // 거래 후 가격 > 평균 체결가
        assertThat(result.newPrice()).isGreaterThan(result.avgPrice());
        // 유저 지불액 > AMM 코인 (수수료 포함)
        assertThat(result.userNetAmount()).isGreaterThan(result.ammAmount());
    }

    @Test
    void pumpThenDump_notProfitableDueToFeeAndSlippage() {
        // 700주 매수
        AmmCalculator.AmmResult buy = AmmCalculator.calcBuy(COIN_RESERVE, SHARE_RESERVE, 700);
        long[] poolAfterBuy = buy.newPool();

        // 700주 매도
        AmmCalculator.AmmResult sell = AmmCalculator.calcSell(poolAfterBuy[0], poolAfterBuy[1], 700);

        // 매도 수령액 < 매수 지불액 (수수료 + 슬리피지 손실)
        assertThat(sell.userNetAmount()).isLessThan(buy.userNetAmount());
    }

    @Test
    void kConstant_maintainedAfterBuyWithCeilingRounding() {
        long k = COIN_RESERVE * SHARE_RESERVE;
        AmmCalculator.AmmResult buy = AmmCalculator.calcBuy(COIN_RESERVE, SHARE_RESERVE, 700);
        long[] pool = buy.newPool();

        // 올림 처리로 k는 약간 증가할 수 있음 (≥ 원본 k)
        assertThat(pool[0] * pool[1]).isGreaterThanOrEqualTo(k);
    }

    @Test
    void poolDepthLimit_throwsWhenQtyExceedsShareReserve() {
        assertThatThrownBy(() -> AmmCalculator.calcBuy(COIN_RESERVE, SHARE_RESERVE, SHARE_RESERVE))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("pool depth");
    }

    @Test
    void newListingBuyLimitIncludesPendingBuyQuantityForMarketOrders() {
        StockRepository stockRepository = mock(StockRepository.class);
        OrderRepository orderRepository = mock(OrderRepository.class);
        TradeEngine engine = new TradeEngine(
                mock(UserRepository.class),
                mock(UserShareRepository.class),
                stockRepository,
                orderRepository,
                mock(SimpMessagingTemplate.class),
                mock(PlatformTransactionManager.class),
                mock(CandleService.class)
        );
        String userId = "user-1";
        String stockId = "stock-1";
        when(stockRepository.findById(stockId)).thenReturn(Optional.of(Stock.builder()
                .channelId(stockId)
                .streamerName("streamer")
                .listedAt(LocalDateTime.now().minusHours(1))
                .totalSupply(10_000)
                .issuedShares(0)
                .currentPrice(1_000)
                .coinReserve(10_000_000L)
                .shareReserve(10_000L)
                .build()));
        when(orderRepository.sumPendingBuyQuantity(userId, stockId)).thenReturn(80L);

        // heldQty(100) + pendingBuyQty(80) + qty(21) = 201 > 200 → 예외
        assertThatThrownBy(() -> ReflectionTestUtils.invokeMethod(
                engine,
                "validateTrade",
                userId,
                stockId,
                true,
                21L,
                BigDecimal.valueOf(21_000),
                BigDecimal.valueOf(1_000_000),
                100L
        )).isInstanceOf(IllegalStateException.class);
    }
}
