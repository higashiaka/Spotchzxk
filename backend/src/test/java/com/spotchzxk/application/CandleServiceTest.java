package com.spotchzxk.application;

import com.spotchzxk.presentation.dto.OhlcCandle;
import com.spotchzxk.domain.order.entity.Order;
import com.spotchzxk.domain.stock.entity.StockSplitEvent;
import com.spotchzxk.domain.order.repository.OrderRepository;
import com.spotchzxk.domain.stock.repository.StockSplitEventRepository;
import com.spotchzxk.domain.stock.repository.StockRepository;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CandleServiceTest {

    private final OrderRepository orderRepository = mock(OrderRepository.class);
    private final StockRepository stockRepository = mock(StockRepository.class);
    private final StockSplitEventRepository stockSplitEventRepository = mock(StockSplitEventRepository.class);
    private final SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);

    private final CandleService service = new CandleService(
            orderRepository,
            stockRepository,
            stockSplitEventRepository,
            messagingTemplate
    );

    @Test
    void onTradeReusesCachedBucketsWithinSameBucket() {
        String stockId = "stock-1";
        long timestamp = 1_771_000_000_000L;
        long oneWeekMs = 604_800_000L;
        long expectedFrom = (timestamp / oneWeekMs) * oneWeekMs;
        when(orderRepository.findByStreamerIdTradedAtGreaterThanEqual(eq(stockId), anyLong()))
                .thenReturn(List.of());

        service.onTrade(stockId, BigDecimal.valueOf(1_000), timestamp);
        service.onTrade(stockId, BigDecimal.valueOf(1_100), timestamp + 1_000);

        ArgumentCaptor<Long> fromMs = ArgumentCaptor.forClass(Long.class);
        verify(orderRepository, times(1))
                .findByStreamerIdTradedAtGreaterThanEqual(eq(stockId), fromMs.capture());
        assertThat(fromMs.getValue()).isEqualTo(expectedFrom);
    }

    @Test
    @SuppressWarnings("unchecked")
    void onTradeIgnoresOrdersOutsideCurrentBucketWhenRestoring() throws InterruptedException {
        String stockId = "stock-1";
        long minuteStart = 1_771_000_020_000L;
        long timestamp = minuteStart + 5_000;
        when(orderRepository.findByStreamerIdTradedAtGreaterThanEqual(eq(stockId), anyLong()))
                .thenReturn(List.of(
                        order(stockId, timestamp, 1_000),
                        order(stockId, minuteStart + 60_000, 9_000)
                ));

        service.onTrade(stockId, BigDecimal.valueOf(1_000), timestamp);
        Thread.sleep(500); // wait for 300ms debounced broadcast

        ArgumentCaptor<Map<String, OhlcCandle>> update = ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/candles/" + stockId), update.capture());

        OhlcCandle oneMinute = update.getValue().get("1m");
        assertPrice(oneMinute.getOpen(), "1000");
        assertPrice(oneMinute.getHigh(), "1000");
        assertPrice(oneMinute.getLow(), "1000");
        assertPrice(oneMinute.getClose(), "1000");
    }

    @Test
    @SuppressWarnings("unchecked")
    void onTradeAdjustsRestoredBucketPricesForLaterStockSplits() throws InterruptedException {
        String stockId = "stock-1";
        long minuteStart = 1_771_000_020_000L;
        long timestamp = minuteStart + 5_000;
        when(orderRepository.findByStreamerIdTradedAtGreaterThanEqual(eq(stockId), anyLong()))
                .thenReturn(List.of(order(stockId, timestamp, 10_000)));
        when(stockSplitEventRepository.findByChannelIdAndExecutedAtGreaterThanOrderByExecutedAtAsc(eq(stockId), anyLong()))
                .thenReturn(List.of(StockSplitEvent.builder()
                        .id("split-1")
                        .channelId(stockId)
                        .splitRatio(10)
                        .executedAt(timestamp + 1)
                        .createdAt(java.time.LocalDateTime.now())
                        .build()));

        service.onTrade(stockId, BigDecimal.valueOf(1_000), timestamp);
        Thread.sleep(500); // wait for 300ms debounced broadcast

        ArgumentCaptor<Map<String, OhlcCandle>> update = ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/candles/" + stockId), update.capture());

        OhlcCandle oneMinute = update.getValue().get("1m");
        assertPrice(oneMinute.getOpen(), "1000");
        assertPrice(oneMinute.getHigh(), "1000");
        assertPrice(oneMinute.getLow(), "1000");
        assertPrice(oneMinute.getClose(), "1000");
    }

    @Test
    void getCandlesReturnsOnlyBucketsBeforeCursor() {
        String stockId = "stock-1";
        long base = 1_771_000_020_000L;
        long before = base + 180_000L;
        when(orderRepository.findByStreamerIdAndTradedAtBetween(eq(stockId), anyLong(), anyLong()))
                .thenReturn(List.of(order(stockId, base + 60_000L, 1_100)));

        List<OhlcCandle> candles = service.getCandles(stockId, "1m", 2, before, 0L, 1_000);

        ArgumentCaptor<Long> fromMs = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<Long> toMs = ArgumentCaptor.forClass(Long.class);
        verify(orderRepository)
                .findByStreamerIdAndTradedAtBetween(eq(stockId), fromMs.capture(), toMs.capture());

        assertThat(fromMs.getValue()).isEqualTo(base + 60_000L);
        assertThat(toMs.getValue()).isEqualTo(before - 1);
        assertThat(candles).extracting(OhlcCandle::getBucketStart)
                .containsExactly(base + 60_000L, base + 120_000L);
    }

    @Test
    void getCandlesFillsEmptyShortIntervalWindowWithFallbackCandles() {
        String stockId = "stock-1";
        long base = 1_771_000_020_000L;
        long before = base + 180_000L;
        when(orderRepository.findByStreamerIdAndTradedAtBetween(eq(stockId), anyLong(), anyLong()))
                .thenReturn(List.of());

        List<OhlcCandle> candles = service.getCandles(stockId, "1m", 2, before, 0L, 1_000);

        assertThat(candles).extracting(OhlcCandle::getBucketStart)
                .containsExactly(base + 60_000L, base + 120_000L);
        assertThat(candles).allSatisfy(candle -> {
            assertPrice(candle.getOpen(), "1000");
            assertPrice(candle.getHigh(), "1000");
            assertPrice(candle.getLow(), "1000");
            assertPrice(candle.getClose(), "1000");
        });
    }

    @Test
    void getCandlesPreservesSubWonExecutedPrices() {
        String stockId = "stock-1";
        long base = 1_771_000_020_000L;
        long before = base + 120_000L;
        when(orderRepository.findByStreamerIdAndTradedAtBetween(eq(stockId), anyLong(), anyLong()))
                .thenReturn(List.of(order(stockId, base + 60_000L, new BigDecimal("0.00149"))));

        List<OhlcCandle> candles = service.getCandles(stockId, "1m", 1, before, 0L, 1_000);

        assertThat(candles).hasSize(1);
        assertPrice(candles.get(0).getOpen(), "0.00149");
        assertPrice(candles.get(0).getHigh(), "0.00149");
        assertPrice(candles.get(0).getLow(), "0.00149");
        assertPrice(candles.get(0).getClose(), "0.00149");
    }

    @Test
    void getCandlesUsesPreviousExecutedPriceForEmptyWindowGaps() {
        String stockId = "stock-1";
        long base = 1_771_000_020_000L;
        long before = base + 180_000L;
        when(orderRepository.findByStreamerIdAndTradedAtBetween(eq(stockId), anyLong(), anyLong()))
                .thenReturn(List.of());
        when(orderRepository.findTopByStreamerIdTradedBeforeWithPrice(eq(stockId), anyLong()))
                .thenReturn(order(stockId, base - 60_000L, 900));

        List<OhlcCandle> candles = service.getCandles(stockId, "1m", 2, before, 0L, 1_000);

        assertThat(candles).hasSize(2);
        assertThat(candles).allSatisfy(candle -> {
            assertPrice(candle.getOpen(), "900");
            assertPrice(candle.getHigh(), "900");
            assertPrice(candle.getLow(), "900");
            assertPrice(candle.getClose(), "900");
        });
    }

    @Test
    void getCandlesAdjustsHistoricalPricesForLaterStockSplits() {
        String stockId = "stock-1";
        long base = 1_771_000_020_000L;
        long splitAt = base + 120_000L;
        long before = base + 180_000L;
        when(orderRepository.findByStreamerIdAndTradedAtBetween(eq(stockId), anyLong(), anyLong()))
                .thenReturn(List.of(order(stockId, base + 60_000L, 10_000)));
        when(stockSplitEventRepository.findByChannelIdAndExecutedAtGreaterThanOrderByExecutedAtAsc(eq(stockId), anyLong()))
                .thenReturn(List.of(StockSplitEvent.builder()
                        .id("split-1")
                        .channelId(stockId)
                        .splitRatio(10)
                        .executedAt(splitAt)
                        .createdAt(java.time.LocalDateTime.now())
                        .build()));

        List<OhlcCandle> candles = service.getCandles(stockId, "1m", 2, before, 0L, 1_000);

        assertPrice(candles.get(0).getClose(), "1000");
    }

    @Test
    void getCandlesAdjustsHistoricalPricesForLaterReverseStockSplits() {
        String stockId = "stock-1";
        long base = 1_771_000_020_000L;
        long splitAt = base + 120_000L;
        long before = base + 180_000L;
        when(orderRepository.findByStreamerIdAndTradedAtBetween(eq(stockId), anyLong(), anyLong()))
                .thenReturn(List.of(order(stockId, base + 60_000L, 50)));
        when(stockSplitEventRepository.findByChannelIdAndExecutedAtGreaterThanOrderByExecutedAtAsc(eq(stockId), anyLong()))
                .thenReturn(List.of(StockSplitEvent.builder()
                        .id("split-1")
                        .channelId(stockId)
                        .splitRatio(-10)
                        .executedAt(splitAt)
                        .createdAt(java.time.LocalDateTime.now())
                        .build()));

        List<OhlcCandle> candles = service.getCandles(stockId, "1m", 2, before, 0L, 500);

        assertPrice(candles.get(0).getClose(), "500");
    }

    @Test
    void getCandlesAdjustsGapFallbackUsingSplitsBetweenPreviousOrderAndWindow() {
        String stockId = "stock-1";
        long base = 1_771_000_020_000L;
        long previousOrderAt = base - 120_000L;
        long splitAt = base - 60_000L;
        long before = base + 180_000L;
        when(orderRepository.findByStreamerIdAndTradedAtBetween(eq(stockId), anyLong(), anyLong()))
                .thenReturn(List.of());
        when(orderRepository.findTopByStreamerIdTradedBeforeWithPrice(eq(stockId), anyLong()))
                .thenReturn(order(stockId, previousOrderAt, 10_000));
        when(stockSplitEventRepository.findByChannelIdAndExecutedAtGreaterThanOrderByExecutedAtAsc(eq(stockId), anyLong()))
                .thenReturn(List.of(StockSplitEvent.builder()
                        .id("split-1")
                        .channelId(stockId)
                        .splitRatio(10)
                        .executedAt(splitAt)
                        .createdAt(java.time.LocalDateTime.now())
                        .build()));

        List<OhlcCandle> candles = service.getCandles(stockId, "1m", 2, before, 0L, 1_000);

        ArgumentCaptor<Long> splitLookupFrom = ArgumentCaptor.forClass(Long.class);
        verify(stockSplitEventRepository)
                .findByChannelIdAndExecutedAtGreaterThanOrderByExecutedAtAsc(eq(stockId), splitLookupFrom.capture());
        assertThat(splitLookupFrom.getValue()).isEqualTo(previousOrderAt);
        assertThat(candles).allSatisfy(candle -> {
            assertPrice(candle.getOpen(), "1000");
            assertPrice(candle.getHigh(), "1000");
            assertPrice(candle.getLow(), "1000");
            assertPrice(candle.getClose(), "1000");
        });
    }

    private static void assertPrice(BigDecimal actual, String expected) {
        assertThat(actual).isEqualByComparingTo(expected);
    }

    private Order order(String stockId, long createdAt, int executedPrice) {
        return order(stockId, createdAt, BigDecimal.valueOf(executedPrice));
    }

    private Order order(String stockId, long createdAt, BigDecimal executedPrice) {
        return Order.builder()
                .id(stockId + "-" + createdAt)
                .userId("user-1")
                .streamerId(stockId)
                .type("buy")
                .quantity(java.math.BigDecimal.ONE)
                .estimatedPrice(executedPrice)
                .executedPrice(executedPrice)
                .status("completed")
                .createdAt(createdAt)
                .build();
    }
}
