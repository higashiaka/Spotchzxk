package com.spotchzxk.service;

import com.spotchzxk.dto.OhlcCandle;
import com.spotchzxk.entity.Order;
import com.spotchzxk.repository.OrderRepository;
import com.spotchzxk.repository.StockRepository;
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
    private final SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);

    private final CandleService service = new CandleService(
            orderRepository,
            stockRepository,
            messagingTemplate
    );

    @Test
    void onTradeReusesCachedBucketsWithinSameBucket() {
        String stockId = "stock-1";
        long timestamp = 1_771_000_000_000L;
        long oneWeekMs = 604_800_000L;
        long expectedFrom = (timestamp / oneWeekMs) * oneWeekMs;
        when(orderRepository.findByStreamerIdAndCreatedAtGreaterThanEqualOrderByCreatedAtAsc(eq(stockId), anyLong()))
                .thenReturn(List.of());

        service.onTrade(stockId, BigDecimal.valueOf(1_000), timestamp);
        service.onTrade(stockId, BigDecimal.valueOf(1_100), timestamp + 1_000);

        ArgumentCaptor<Long> fromMs = ArgumentCaptor.forClass(Long.class);
        verify(orderRepository, times(1))
                .findByStreamerIdAndCreatedAtGreaterThanEqualOrderByCreatedAtAsc(eq(stockId), fromMs.capture());
        assertThat(fromMs.getValue()).isEqualTo(expectedFrom);
    }

    @Test
    @SuppressWarnings("unchecked")
    void onTradeIgnoresOrdersOutsideCurrentBucketWhenRestoring() {
        String stockId = "stock-1";
        long minuteStart = 1_771_000_020_000L;
        long timestamp = minuteStart + 5_000;
        when(orderRepository.findByStreamerIdAndCreatedAtGreaterThanEqualOrderByCreatedAtAsc(eq(stockId), anyLong()))
                .thenReturn(List.of(
                        order(stockId, timestamp, 1_000),
                        order(stockId, minuteStart + 60_000, 9_000)
                ));

        service.onTrade(stockId, BigDecimal.valueOf(1_000), timestamp);

        ArgumentCaptor<Map<String, OhlcCandle>> update = ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/candles/" + stockId), update.capture());

        OhlcCandle oneMinute = update.getValue().get("1m");
        assertThat(oneMinute.getOpen()).isEqualTo(1_000);
        assertThat(oneMinute.getHigh()).isEqualTo(1_000);
        assertThat(oneMinute.getLow()).isEqualTo(1_000);
        assertThat(oneMinute.getClose()).isEqualTo(1_000);
    }

    private Order order(String stockId, long createdAt, int executedPrice) {
        return Order.builder()
                .id(stockId + "-" + createdAt)
                .userId("user-1")
                .streamerId(stockId)
                .type("buy")
                .quantity(1)
                .estimatedPrice(BigDecimal.valueOf(executedPrice))
                .executedPrice(BigDecimal.valueOf(executedPrice))
                .status("completed")
                .createdAt(createdAt)
                .build();
    }
}
