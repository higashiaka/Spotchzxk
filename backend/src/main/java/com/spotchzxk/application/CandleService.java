package com.spotchzxk.application;

import com.spotchzxk.presentation.dto.OhlcCandle;
import com.spotchzxk.domain.order.entity.Order;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.entity.StockSplitEvent;
import com.spotchzxk.domain.order.repository.OrderRepository;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.stock.repository.StockSplitEventRepository;
import com.spotchzxk.domain.trading.service.MarketPrice;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class CandleService {

    private static final long MS_1M  =        60_000L;
    private static final long MS_5M  =       300_000L;
    private static final long MS_1H  =     3_600_000L;
    private static final long MS_1D  =    86_400_000L;
    private static final long MS_1W  =   604_800_000L;
    private static final int  MAX_CANDLES = 300;

    private static final Map<String, Long> INTERVAL_MS = Map.of(
            "1m", MS_1M, "5m", MS_5M, "1h", MS_1H, "1d", MS_1D, "1w", MS_1W
    );
    private static final List<String> ALL_INTERVALS = List.of("1m", "5m", "1h", "1d", "1w");

    private final OrderRepository orderRepository;
    private final StockRepository stockRepository;
    private final StockSplitEventRepository stockSplitEventRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final Map<Long, Set<String>> tradedStockIdsByMinute = new ConcurrentHashMap<>();
    private final Map<String, OhlcCandle> currentBucketCandles = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Object> stockLocks = new ConcurrentHashMap<>();
    // Debounce candle broadcasts: during bulk trades, collapse rapid-fire updates
    // into a single broadcast per stockId per 300 ms to prevent client freeze.
    private final ConcurrentHashMap<String, Map<String, OhlcCandle>> pendingBroadcasts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ScheduledFuture<?>> broadcastTimers = new ConcurrentHashMap<>();
    private final ScheduledThreadPoolExecutor broadcastScheduler = new ScheduledThreadPoolExecutor(2);

    private Object lockFor(String stockId) {
        return stockLocks.computeIfAbsent(stockId, k -> new Object());
    }

    // ?? REST: DB order history ??return candle list ??????????????????????????????????????

    public List<OhlcCandle> getCandles(String stockId, String interval, int count, long beforeMs, long listedAtMs, long fallback) {
        return getCandles(stockId, interval, count, beforeMs, listedAtMs, BigDecimal.valueOf(fallback));
    }

    public List<OhlcCandle> getCandles(String stockId, String interval, int count, long beforeMs, long listedAtMs, BigDecimal fallback) {
        long bucketMs = INTERVAL_MS.getOrDefault(interval, MS_1M);
        int limit = Math.max(1, Math.min(count, MAX_CANDLES));
        long safeBeforeMs = beforeMs > 0 ? beforeMs : System.currentTimeMillis();
        long from = Math.max(listedAtMs, safeBeforeMs - bucketMs * limit);

        List<Order> orders = from < safeBeforeMs
                ? orderRepository.findByStreamerIdAndTradedAtBetween(stockId, from, safeBeforeMs - 1)
                : List.of();
        Order previousOrder = orderRepository.findTopByStreamerIdTradedBeforeWithPrice(stockId, from);
        long splitLookupFrom = previousOrder != null ? previousOrder.tradeAt() : from;
        List<StockSplitEvent> splitEvents = stockSplitEventRepository
                .findByChannelIdAndExecutedAtGreaterThanOrderByExecutedAtAsc(stockId, splitLookupFrom);
        BigDecimal gapFallback = previousOrder != null
                ? adjustPriceForSplitsAfter(previousOrder.getExecutedPrice(), previousOrder.tradeAt(), splitEvents)
                : fallback;

        List<OhlcCandle> oneMin = buildOneMin(orders, listedAtMs, splitEvents);
        List<OhlcCandle> result = "1m".equals(interval) ? oneMin : aggregate(oneMin, bucketMs);

        result = fillGaps(result, bucketMs, from, safeBeforeMs, gapFallback);

        result.removeIf(c -> c.getBucketStart() < listedAtMs);
        result.removeIf(c -> c.getBucketStart() >= safeBeforeMs);
        // If the listing time falls mid-bucket, removeIf may strip even the flat candle ??guarantee at least one
        if (result.isEmpty()) {
            long currentBucket = (System.currentTimeMillis() / bucketMs) * bucketMs;
            if (safeBeforeMs > currentBucket && currentBucket >= listedAtMs) {
                result = new ArrayList<>(List.of(flat(currentBucket, fallback)));
            }
        }
        int from2 = Math.max(0, result.size() - limit);
        return new ArrayList<>(result.subList(from2, result.size()));
    }

    // ?? On trade: recompute current buckets for each interval ??STOMP broadcast ?????????????????????

    public void onTrade(String stockId, BigDecimal executedPrice, long timestamp) {
        Map<String, OhlcCandle> update = recordTradeAndCompute(stockId, executedPrice, timestamp);
        // Merge into pending state for this stockId
        pendingBroadcasts.merge(stockId, update, (existing, incoming) -> {
            existing.putAll(incoming);
            return existing;
        });
        // Cancel previous timer and reschedule — broadcast fires 300 ms after the last trade
        ScheduledFuture<?> prev = broadcastTimers.put(stockId,
                broadcastScheduler.schedule(() -> {
                    Map<String, OhlcCandle> payload = pendingBroadcasts.remove(stockId);
                    broadcastTimers.remove(stockId);
                    if (payload != null) {
                        messagingTemplate.convertAndSend("/topic/candles/" + stockId, payload);
                    }
                }, 300, TimeUnit.MILLISECONDS));
        if (prev != null) prev.cancel(false);
    }

    private Map<String, OhlcCandle> recordTradeAndCompute(String stockId, BigDecimal executedPrice, long timestamp) {
        long minuteStart = (timestamp / MS_1M) * MS_1M;
        tradedStockIdsByMinute
                .computeIfAbsent(minuteStart, ignored -> ConcurrentHashMap.newKeySet())
                .add(stockId);

        synchronized (lockFor(stockId)) {
            return computeCurrentBuckets(stockId, executedPrice, timestamp);
        }
    }

    public void evictStockCache(String stockId) {
        synchronized (lockFor(stockId)) {
            currentBucketCandles.keySet().removeIf(key -> key.startsWith(stockId + ":"));
        }
    }

    // ?? Every minute: broadcast flat candles only for live stocks with no recent trades ??????????

    @Scheduled(cron = "0 * * * * *")
    public void tick() {
        long now = System.currentTimeMillis();
        long bucketStart1m = (now / MS_1M) * MS_1M;
        tradedStockIdsByMinute.keySet().removeIf(bucket -> bucket < bucketStart1m);
        Set<String> tradedStockIds = tradedStockIdsByMinute.getOrDefault(bucketStart1m, Set.of());

        for (Stock stock : stockRepository.findByIsLiveTrue()) {
            String stockId = stock.getChannelId();

            // If a trade occurred this minute, it was already broadcast by onTrade ??skip
            if (tradedStockIds.contains(stockId)) continue;

            BigDecimal price = MarketPrice.spotPrice(stock);
            Map<String, OhlcCandle> update = new HashMap<>();
            for (String interval : ALL_INTERVALS) {
                long bms = INTERVAL_MS.get(interval);
                update.put(interval, flat((now / bms) * bms, price));
            }
            messagingTemplate.convertAndSend("/topic/candles/" + stockId, update);
        }
    }

    // ?? Internal utilities ???????????????????????????????????????????????????????????????

    /** Order list → 1-minute candle list (only candles with trades, no gap-filling) */
    private List<OhlcCandle> buildOneMin(List<Order> orders, long listedAtMs, List<StockSplitEvent> splitEvents) {
        Map<Long, OhlcCandle> buckets = new LinkedHashMap<>();
        for (Order o : orders) {
            if (o.tradeAt() < listedAtMs || o.getExecutedPrice() == null) continue;
            BigDecimal price = adjustPriceForSplitsAfter(o.getExecutedPrice(), o.tradeAt(), splitEvents);
            long bucket = (o.tradeAt() / MS_1M) * MS_1M;
            OhlcCandle c = buckets.get(bucket);
            if (c == null) {
                buckets.put(bucket, OhlcCandle.builder()
                        .bucketStart(bucket)
                        .open(price).high(price).low(price).close(price).build());
            } else {
                buckets.put(bucket, OhlcCandle.builder()
                        .bucketStart(bucket)
                        .open(c.getOpen())
                        .high(max(c.getHigh(), price))
                        .low(min(c.getLow(), price))
                        .close(price).build());
            }
        }
        return new ArrayList<>(buckets.values());
    }


    /** 1-minute candles ??aggregated to higher interval */
    private List<OhlcCandle> aggregate(List<OhlcCandle> oneMin, long bucketMs) {
        Map<Long, OhlcCandle> buckets = new LinkedHashMap<>();
        for (OhlcCandle c : oneMin) {
            long bucket = (c.getBucketStart() / bucketMs) * bucketMs;
            OhlcCandle agg = buckets.get(bucket);
            if (agg == null) {
                buckets.put(bucket, OhlcCandle.builder()
                        .bucketStart(bucket)
                        .open(c.getOpen()).high(c.getHigh()).low(c.getLow()).close(c.getClose()).build());
            } else {
                buckets.put(bucket, OhlcCandle.builder()
                        .bucketStart(bucket)
                        .open(agg.getOpen())
                        .high(max(agg.getHigh(), c.getHigh()))
                        .low(min(agg.getLow(), c.getLow()))
                        .close(c.getClose()).build());
            }
        }
        return new ArrayList<>(buckets.values());
    }

    /**
     * Fills gaps between candles and up to the current bucket with flat candles.
     * If there are no trades at all, returns a single flat candle for the current bucket.
     */
    private List<OhlcCandle> fillGaps(List<OhlcCandle> candles, long bucketMs, long fromMs, long beforeMs, BigDecimal fallback) {
        long firstAllowedBucket = (fromMs / bucketMs) * bucketMs;
        long lastAllowedBucket = ((beforeMs - 1) / bucketMs) * bucketMs;

        if (candles.isEmpty()) {
            List<OhlcCandle> filled = new ArrayList<>();
            for (long b = firstAllowedBucket; b <= lastAllowedBucket; b += bucketMs) {
                filled.add(flat(b, fallback));
            }
            return filled;
        }

        List<OhlcCandle> filled = new ArrayList<>();
        OhlcCandle first = candles.get(0);
        for (long b = firstAllowedBucket; b < first.getBucketStart(); b += bucketMs) {
            filled.add(flat(b, fallback));
        }
        for (OhlcCandle c : candles) {
            if (!filled.isEmpty()) {
                OhlcCandle prev = filled.get(filled.size() - 1);
                for (long b = prev.getBucketStart() + bucketMs; b < c.getBucketStart(); b += bucketMs) {
                    filled.add(flat(b, prev.getClose()));
                }
            }
            filled.add(c);
        }

        // Trailing gap uses current price so post-split gaps reflect the split-adjusted price, not the stale pre-split last trade
        OhlcCandle last = filled.get(filled.size() - 1);
        for (long b = last.getBucketStart() + bucketMs; b <= lastAllowedBucket; b += bucketMs) {
            filled.add(flat(b, fallback));
        }

        return filled;
    }

    /** Compute the current candle for each interval based on the trade timestamp */
    private Map<String, OhlcCandle> computeCurrentBuckets(String stockId, BigDecimal executedPrice, long timestamp) {
        BigDecimal price = executedPrice;
        Map<String, OhlcCandle> result = new HashMap<>();
        Map<String, Long> cacheMisses = new LinkedHashMap<>();
        long minBucketStart = Long.MAX_VALUE;

        for (String interval : ALL_INTERVALS) {
            long bucketMs = INTERVAL_MS.get(interval);
            long bucketStart = (timestamp / bucketMs) * bucketMs;
            OhlcCandle cached = currentBucketCandles.get(stockId + ":" + interval);
            if (cached != null && cached.getBucketStart() == bucketStart) {
                applyPrice(cached, price);
                result.put(interval, cached);
            } else {
                cacheMisses.put(interval, bucketStart);
                if (bucketStart < minBucketStart) minBucketStart = bucketStart;
            }
        }

        if (!cacheMisses.isEmpty()) {
            // Cover all cache-miss intervals with a single query
            List<Order> orders = orderRepository
                    .findByStreamerIdTradedAtGreaterThanEqual(stockId, minBucketStart);
            for (Map.Entry<String, Long> entry : cacheMisses.entrySet()) {
                String interval = entry.getKey();
                long bucketStart = entry.getValue();
                long bucketEnd = bucketStart + INTERVAL_MS.get(interval);
                List<StockSplitEvent> splitEvents = stockSplitEventRepository
                        .findByChannelIdAndExecutedAtGreaterThanOrderByExecutedAtAsc(stockId, bucketStart);
                OhlcCandle candle = restoreCurrentBucket(orders, bucketStart, bucketEnd, price, splitEvents);
                currentBucketCandles.put(stockId + ":" + interval, candle);
                result.put(interval, candle);
            }
        }

        return result;
    }

    private OhlcCandle restoreCurrentBucket(
            List<Order> orders,
            long bucketStart,
            long bucketEnd,
            BigDecimal fallbackPrice,
            List<StockSplitEvent> splitEvents
    ) {
        List<Order> inBucket = orders.stream()
                .filter(o -> o.tradeAt() >= bucketStart
                        && o.tradeAt() < bucketEnd
                        && o.getExecutedPrice() != null)
                .collect(Collectors.toList());

        if (inBucket.isEmpty()) {
            return flat(bucketStart, fallbackPrice);
        }

        List<BigDecimal> prices = inBucket.stream()
                .map(o -> adjustPriceForSplitsAfter(o.getExecutedPrice(), o.tradeAt(), splitEvents))
                .collect(Collectors.toList());
        BigDecimal open = prices.get(0);
        BigDecimal close = prices.get(prices.size() - 1);
        BigDecimal high = prices.stream().max(BigDecimal::compareTo).orElse(open);
        BigDecimal low = prices.stream().min(BigDecimal::compareTo).orElse(open);

        OhlcCandle candle = OhlcCandle.builder()
                .bucketStart(bucketStart)
                .open(open).high(high).low(low).close(close).build();
        applyPrice(candle, fallbackPrice);
        return candle;
    }

    private void applyPrice(OhlcCandle candle, BigDecimal price) {
        if (price.compareTo(candle.getHigh()) > 0) candle.setHigh(price);
        if (price.compareTo(candle.getLow()) < 0) candle.setLow(price);
        candle.setClose(price);
    }

    private OhlcCandle flat(long bucketStart, BigDecimal price) {
        return OhlcCandle.builder()
                .bucketStart(bucketStart)
                .open(price).high(price).low(price).close(price).build();
    }

    private BigDecimal adjustPriceForSplitsAfter(BigDecimal price, long priceAt, List<StockSplitEvent> splitEvents) {
        BigDecimal adjusted = price;
        for (StockSplitEvent event : splitEvents) {
            if (event.getExecutedAt() > priceAt) {
                int ratio = event.getSplitRatio();
                if (ratio > 0) {
                    adjusted = adjusted.divide(BigDecimal.valueOf(ratio), 2, RoundingMode.HALF_UP);
                } else if (ratio < 0) {
                    adjusted = adjusted.multiply(BigDecimal.valueOf(Math.abs(ratio)));
                }
            }
        }
        return adjusted;
    }

    private static BigDecimal max(BigDecimal a, BigDecimal b) {
        return a.compareTo(b) >= 0 ? a : b;
    }

    private static BigDecimal min(BigDecimal a, BigDecimal b) {
        return a.compareTo(b) <= 0 ? a : b;
    }

}


