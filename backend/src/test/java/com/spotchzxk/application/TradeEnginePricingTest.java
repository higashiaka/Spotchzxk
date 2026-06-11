package com.spotchzxk.application;


import com.spotchzxk.domain.trading.service.AmmCalculator;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.order.entity.Order;
import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.order.repository.OrderRepository;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

import java.math.BigDecimal;
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

    @Test
    void buySlippage_avgPriceExceedsInitialPrice() {
        AmmCalculator.AmmResult result = AmmCalculator.calcBuy(COIN_RESERVE, SHARE_RESERVE, 700);

        // ?됯퇏 泥닿껐媛 > 珥덇린媛 (?щ━?쇱?)
        assertThat(result.avgPrice()).isGreaterThan(BigDecimal.valueOf(10_000));
        // 嫄곕옒 ??媛寃?> ?됯퇏 泥닿껐媛
        assertThat(result.newPrice()).isGreaterThan(result.avgPrice());
        // ?좎? 吏遺덉븸 > AMM 肄붿씤 (?섏닔猷??ы븿)
        assertThat(result.userNetAmount()).isGreaterThan(result.ammAmount());
    }

    @Test
    void pumpThenDump_notProfitableDueToFeeAndSlippage() {
        // 700二?留ㅼ닔
        AmmCalculator.AmmResult buy = AmmCalculator.calcBuy(COIN_RESERVE, SHARE_RESERVE, 700);
        long[] poolAfterBuy = buy.newPool();

        // 700二?留ㅻ룄
        AmmCalculator.AmmResult sell = AmmCalculator.calcSell(poolAfterBuy[0], poolAfterBuy[1], 700);

        // 留ㅻ룄 ?섎졊??< 留ㅼ닔 吏遺덉븸 (?섏닔猷?+ ?щ━?쇱? ?먯떎)
        assertThat(sell.userNetAmount()).isLessThan(buy.userNetAmount());
    }

    @Test
    void kConstant_maintainedAfterBuyWithCeilingRounding() {
        long k = COIN_RESERVE * SHARE_RESERVE;
        AmmCalculator.AmmResult buy = AmmCalculator.calcBuy(COIN_RESERVE, SHARE_RESERVE, 700);
        long[] pool = buy.newPool();

        // ?щ┝ 泥섎━濡?k???쎄컙 利앷??????덉쓬 (???먮낯 k)
        assertThat(pool[0] * pool[1]).isGreaterThanOrEqualTo(k);
    }

    @Test
    void poolDepthLimit_throwsWhenQtyExceedsShareReserve() {
        assertThatThrownBy(() -> AmmCalculator.calcBuy(COIN_RESERVE, SHARE_RESERVE, SHARE_RESERVE))
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
                mock(CandleService.class)
        );
        String stockId = "stock-1";
        Order pendingOrder = Order.builder()
                .id("order-1")
                .userId("user-1")
                .streamerId(stockId)
                .type("buy")
                .quantity(1)
                .orderMode("limit")
                .limitPrice(BigDecimal.valueOf(10_000))
                .status("pending")
                .createdAt(System.currentTimeMillis())
                .build();

        when(stockRepository.findById(stockId)).thenReturn(Optional.of(Stock.builder()
                .channelId(stockId)
                .streamerName("streamer")
                .currentPrice(10_000)
                .coinReserve(COIN_RESERVE)
                .shareReserve(SHARE_RESERVE)
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
                mock(CandleService.class)
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
                .currentPrice(10_000)
                .coinReserve(COIN_RESERVE)
                .shareReserve(SHARE_RESERVE)
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
                1L,
                BigDecimal.valueOf(10_000)
        ))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("蹂댁쑀 二쇱떇??遺議깊빀?덈떎.");
    }
}



