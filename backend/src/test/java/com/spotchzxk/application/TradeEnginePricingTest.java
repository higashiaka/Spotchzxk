package com.spotchzxk.application;


import com.spotchzxk.domain.trading.service.AmmCalculator;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.order.entity.Order;
import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.order.repository.OrderRepository;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.trading.repository.TradeFailureLogRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import org.junit.jupiter.api.Test;
import com.spotchzxk.application.RankCacheService;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TradeEnginePricingTest {

    private static final long COIN_RESERVE = 100_000_000L;
    private static final long SHARE_RESERVE = 10_000L;
    private static final BigInteger COIN_RESERVE_BIG = BigInteger.valueOf(COIN_RESERVE);
    private static final BigInteger SHARE_RESERVE_BIG = BigInteger.valueOf(SHARE_RESERVE);

    @Test
    void buySlippage_avgPriceExceedsInitialPrice() {
        AmmCalculator.AmmResult result = AmmCalculator.calcBuy(COIN_RESERVE_BIG, SHARE_RESERVE_BIG, 700);

        // avg fill price > initial price due to slippage
        assertThat(result.avgPrice()).isGreaterThan(BigDecimal.valueOf(10_000));
        // post-trade spot price > avg fill price (price impact)
        assertThat(result.newPrice()).isGreaterThan(result.avgPrice());
        // ?좎? 吏遺덉븸 > AMM 肄붿씤 (?섏닔猷??ы븿)
        assertThat(result.userNetAmount()).isGreaterThan(result.ammAmount());
    }

    @Test
    void pumpThenDump_notProfitableDueToFeeAndSlippage() {
        // 700二?留ㅼ닔
        AmmCalculator.AmmResult buy = AmmCalculator.calcBuy(COIN_RESERVE_BIG, SHARE_RESERVE_BIG, 700);
        BigInteger[] poolAfterBuy = buy.newPool();

        // 700二?留ㅻ룄
        AmmCalculator.AmmResult sell = AmmCalculator.calcSell(poolAfterBuy[0], poolAfterBuy[1], 700);

        // sell proceeds < buy cost due to fee + slippage
        assertThat(sell.userNetAmount()).isLessThan(buy.userNetAmount());
    }

    @Test
    void kConstant_maintainedAfterBuyWithCeilingRounding() {
        BigInteger k = COIN_RESERVE_BIG.multiply(SHARE_RESERVE_BIG);
        AmmCalculator.AmmResult buy = AmmCalculator.calcBuy(COIN_RESERVE_BIG, SHARE_RESERVE_BIG, 700);
        BigInteger[] pool = buy.newPool();

        // ?щ┝ 泥섎━濡?k???쎄컙 利앷??????덉쓬 (???먮낯 k)
        assertThat(pool[0].multiply(pool[1])).isGreaterThanOrEqualTo(k);
    }

    @Test
    void ammSpotPrice_preservesFractionalWonBelowOneWon() {
        BigDecimal price = AmmCalculator.price(BigInteger.ONE, BigInteger.valueOf(10_000));

        assertThat(price).isEqualByComparingTo("0.000100");
    }

    @Test
    void poolDepthLimit_throwsWhenQtyExceedsShareReserve() {
        assertThatThrownBy(() -> AmmCalculator.calcBuy(COIN_RESERVE_BIG, SHARE_RESERVE_BIG, SHARE_RESERVE))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("AMM");
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
                mock(AsyncBroadcastService.class),
                mock(PlatformTransactionManager.class),
                mock(CandleService.class),
                mock(TradeFailureLogRepository.class),
                mock(RankCacheService.class)
        );
        String userId = "user-1";
        String stockId = "stock-1";
        when(stockRepository.findById(stockId)).thenReturn(Optional.of(Stock.builder()
                .channelId(stockId)
                .streamerName("streamer")
                .listedAt(LocalDateTime.now().minusHours(1))
                .totalSupply(BigDecimal.valueOf(10_000))
                .issuedShares(BigDecimal.ZERO)
                .currentPrice(BigDecimal.valueOf(1_000))
                .coinReserve(BigInteger.valueOf(10_000_000L))
                .shareReserve(BigInteger.valueOf(10_000L))
                .build()));
        when(orderRepository.sumPendingBuyQuantity(userId, stockId)).thenReturn(java.math.BigDecimal.valueOf(80));

        // heldQty(100) + pendingBuyQty(80) + qty(21) = 201 > 200 ???덉쇅
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

    @Test
    void processPendingLimitOrdersDoesNotPropagateSingleOrderFailure() {
        StockRepository stockRepository = mock(StockRepository.class);
        OrderRepository orderRepository = mock(OrderRepository.class);
        PlatformTransactionManager txManager = mock(PlatformTransactionManager.class);
        TradeEngine engine = new TradeEngine(
                mock(UserRepository.class),
                mock(UserShareRepository.class),
                stockRepository,
                orderRepository,
                mock(AsyncBroadcastService.class),
                txManager,
                mock(CandleService.class),
                mock(TradeFailureLogRepository.class),
                mock(RankCacheService.class)
        );
        String stockId = "stock-1";
        Order pendingOrder = Order.builder()
                .id("order-1")
                .userId("user-1")
                .streamerId(stockId)
                .type("buy")
                .quantity(java.math.BigDecimal.ONE)
                .orderMode("limit")
                .limitPrice(BigDecimal.valueOf(10_000))
                .status("pending")
                .createdAt(System.currentTimeMillis())
                .build();

        when(stockRepository.findById(stockId)).thenReturn(Optional.of(Stock.builder()
                .channelId(stockId)
                .streamerName("streamer")
                .currentPrice(BigDecimal.valueOf(10_000))
                .coinReserve(COIN_RESERVE_BIG)
                .shareReserve(SHARE_RESERVE_BIG)
                .build()));
        when(orderRepository.findByStreamerIdAndStatusOrderByCreatedAtAsc(stockId, "pending"))
                .thenReturn(List.of(pendingOrder));

        assertThatCode(() -> ReflectionTestUtils.invokeMethod(
                engine,
                "processPendingLimitOrders",
                stockId
        )).doesNotThrowAnyException();
    }

    @Test
    void sellWithMissingDbHoldingThrowsBusinessError() {
        UserShareRepository userShareRepository = mock(UserShareRepository.class);
        TradeEngine engine = new TradeEngine(
                mock(UserRepository.class),
                userShareRepository,
                mock(StockRepository.class),
                mock(OrderRepository.class),
                mock(AsyncBroadcastService.class),
                mock(PlatformTransactionManager.class),
                mock(CandleService.class),
                mock(TradeFailureLogRepository.class),
                mock(RankCacheService.class)
        );
        String userId = "user-1";
        String stockId = "stock-1";
        User user = User.builder()
                .id(userId)
                .coinBalance(BigDecimal.valueOf(1_000_000))
                .build();
        Stock stock = Stock.builder()
                .channelId(stockId)
                .streamerName("streamer")
                .currentPrice(BigDecimal.valueOf(10_000))
                .coinReserve(COIN_RESERVE_BIG)
                .shareReserve(SHARE_RESERVE_BIG)
                .build();

        when(userShareRepository.findByUserIdAndStockChannelId(userId, stockId))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> ReflectionTestUtils.invokeMethod(
                engine,
                "updateUserShareAndCalculateProfit",
                user,
                stock,
                stockId,
                false,
                java.math.BigInteger.ONE,
                BigDecimal.valueOf(10_000)
        ))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("보유 수량이 부족합니다.");
    }
    @Test
    void fractionalSellProceedsFloorsGrossAndAppliesNormalFee() {
        TradeEngine engine = new TradeEngine(
                mock(UserRepository.class),
                mock(UserShareRepository.class),
                mock(StockRepository.class),
                mock(OrderRepository.class),
                mock(AsyncBroadcastService.class),
                mock(PlatformTransactionManager.class),
                mock(CandleService.class),
                mock(TradeFailureLogRepository.class),
                mock(RankCacheService.class)
        );

        BigDecimal proceeds = ReflectionTestUtils.invokeMethod(
                engine,
                "fractionalSellProceeds",
                new BigDecimal("0.75"),
                new BigDecimal("1000")
        );

        BigInteger[] fee = AmmCalculator.fee(BigInteger.valueOf(750));
        assertThat(proceeds).isEqualByComparingTo(
                new BigDecimal(BigInteger.valueOf(750).subtract(fee[0]).subtract(fee[1]))
        );
    }
}



