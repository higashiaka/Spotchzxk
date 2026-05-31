package com.spotchzxk.service;

import com.spotchzxk.dto.OhlcCandle;
import com.spotchzxk.entity.Order;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.repository.OrderRepository;
import com.spotchzxk.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
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
    private static final int  MAX_CANDLES = 50;

    private static final Map<String, Long> INTERVAL_MS = Map.of(
            "1m", MS_1M, "5m", MS_5M, "1h", MS_1H, "1d", MS_1D, "1w", MS_1W
    );
    private static final List<String> ALL_INTERVALS = List.of("1m", "5m", "1h", "1d", "1w");

    private final OrderRepository orderRepository;
    private final StockRepository stockRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final Map<Long, Set<String>> tradedStockIdsByMinute = new ConcurrentHashMap<>();
    private final Map<String, OhlcCandle> currentBucketCandles = new ConcurrentHashMap<>();

    // ── REST: DB 주문 기록 → 캔들 목록 반환 ──────────────────────────────────────

    public List<OhlcCandle> getCandles(String stockId, String interval, int count, long listedAtMs, double fallback) {
        long bucketMs = INTERVAL_MS.getOrDefault(interval, MS_1M);
        long from = Math.max(listedAtMs, System.currentTimeMillis() - bucketMs * count * 3);

        List<Order> orders = orderRepository
                .findByStreamerIdAndCreatedAtGreaterThanEqualOrderByCreatedAtAsc(stockId, from);

        List<OhlcCandle> oneMin = buildOneMin(orders, listedAtMs);
        List<OhlcCandle> result = "1m".equals(interval) ? oneMin : aggregate(oneMin, bucketMs);

        result = fillGaps(result, bucketMs, fallback);

        result.removeIf(c -> c.getBucketStart() < listedAtMs);
        // 상장 시각이 현재 버킷 중간이면 removeIf가 flat 캔들까지 제거할 수 있음 → 최소 1개 보장
        if (result.isEmpty()) {
            long currentBucket = (System.currentTimeMillis() / bucketMs) * bucketMs;
            result = new ArrayList<>(List.of(flat(currentBucket, fallback)));
        }
        int from2 = Math.max(0, result.size() - count);
        return new ArrayList<>(result.subList(from2, result.size()));
    }

    // ── 거래 발생 시: 현재 각 봉 재계산 → STOMP 브로드캐스트 ─────────────────────

    public synchronized void onTrade(String stockId, BigDecimal executedPrice, long timestamp) {
        long minuteStart = (timestamp / MS_1M) * MS_1M;
        tradedStockIdsByMinute
                .computeIfAbsent(minuteStart, ignored -> ConcurrentHashMap.newKeySet())
                .add(stockId);

        Map<String, OhlcCandle> update = computeCurrentBuckets(stockId, executedPrice, timestamp);
        messagingTemplate.convertAndSend("/topic/candles/" + stockId, update);
    }

    // ── 1분마다: 라이브 종목 중 거래 없는 종목만 flat 캔들 브로드캐스트 ──────────

    @Scheduled(cron = "0 * * * * *")
    public void tick() {
        long now = System.currentTimeMillis();
        long bucketStart1m = (now / MS_1M) * MS_1M;
        tradedStockIdsByMinute.keySet().removeIf(bucket -> bucket < bucketStart1m);
        Set<String> tradedStockIds = tradedStockIdsByMinute.getOrDefault(bucketStart1m, Set.of());

        for (Stock stock : stockRepository.findByIsLiveTrue()) {
            String stockId = stock.getChannelId();

            // 이번 분에 거래가 있었으면 onTrade 에서 이미 브로드캐스트됨 → 스킵
            if (tradedStockIds.contains(stockId)) continue;

            double price = stock.getCurrentPrice();
            Map<String, OhlcCandle> update = new HashMap<>();
            for (String interval : ALL_INTERVALS) {
                long bms = INTERVAL_MS.get(interval);
                update.put(interval, flat((now / bms) * bms, price));
            }
            messagingTemplate.convertAndSend("/topic/candles/" + stockId, update);
        }
    }

    // ── 내부 유틸 ───────────────────────────────────────────────────────────────

    /** 주문 목록 → 1분봉 리스트 (갭 없이 거래 있는 봉만) */
    private List<OhlcCandle> buildOneMin(List<Order> orders, long listedAtMs) {
        Map<Long, OhlcCandle> buckets = new LinkedHashMap<>();
        for (Order o : orders) {
            if (o.getCreatedAt() < listedAtMs || o.getExecutedPrice() == null) continue;
            double price = o.getExecutedPrice().doubleValue();
            long bucket = (o.getCreatedAt() / MS_1M) * MS_1M;
            OhlcCandle c = buckets.get(bucket);
            if (c == null) {
                buckets.put(bucket, OhlcCandle.builder()
                        .bucketStart(bucket)
                        .open(price).high(price).low(price).close(price).build());
            } else {
                if (price > c.getHigh()) c.setHigh(price);
                if (price < c.getLow())  c.setLow(price);
                c.setClose(price);
            }
        }
        return new ArrayList<>(buckets.values());
    }

    /** 1분봉 → 상위 interval 집계 */
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
                if (c.getHigh() > agg.getHigh()) agg.setHigh(c.getHigh());
                if (c.getLow()  < agg.getLow())  agg.setLow(c.getLow());
                agg.setClose(c.getClose());
            }
        }
        return new ArrayList<>(buckets.values());
    }

    /**
     * 봉 사이 갭과 현재 봉까지 flat 캔들로 채움.
     * 거래가 전혀 없으면 현재 봉 하나만 반환.
     */
    private List<OhlcCandle> fillGaps(List<OhlcCandle> candles, long bucketMs, double fallback) {
        long now = System.currentTimeMillis();
        long currentBucket = (now / bucketMs) * bucketMs;

        if (candles.isEmpty()) {
            return new ArrayList<>(List.of(flat(currentBucket, fallback)));
        }

        List<OhlcCandle> filled = new ArrayList<>();
        for (OhlcCandle c : candles) {
            if (!filled.isEmpty()) {
                OhlcCandle prev = filled.get(filled.size() - 1);
                for (long b = prev.getBucketStart() + bucketMs; b < c.getBucketStart(); b += bucketMs) {
                    filled.add(flat(b, prev.getClose()));
                }
            }
            filled.add(c);
        }

        // 마지막 봉부터 현재 봉까지 채움
        OhlcCandle last = filled.get(filled.size() - 1);
        for (long b = last.getBucketStart() + bucketMs; b <= currentBucket; b += bucketMs) {
            filled.add(flat(b, last.getClose()));
        }

        return filled;
    }

    /** 거래 발생 시점 기준으로 각 interval의 현재 봉 계산 */
    private Map<String, OhlcCandle> computeCurrentBuckets(String stockId, BigDecimal executedPrice, long timestamp) {
        double price = executedPrice.doubleValue();
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
            // 캐시 미스 interval 전체를 단일 쿼리로 커버
            List<Order> orders = orderRepository
                    .findByStreamerIdAndCreatedAtGreaterThanEqualOrderByCreatedAtAsc(stockId, minBucketStart);
            for (Map.Entry<String, Long> entry : cacheMisses.entrySet()) {
                String interval = entry.getKey();
                long bucketStart = entry.getValue();
                long bucketEnd = bucketStart + INTERVAL_MS.get(interval);
                OhlcCandle candle = restoreCurrentBucket(orders, bucketStart, bucketEnd, price);
                currentBucketCandles.put(stockId + ":" + interval, candle);
                result.put(interval, candle);
            }
        }

        return result;
    }

    private OhlcCandle restoreCurrentBucket(List<Order> orders, long bucketStart, long bucketEnd, double fallbackPrice) {
        List<Order> inBucket = orders.stream()
                .filter(o -> o.getCreatedAt() >= bucketStart
                        && o.getCreatedAt() < bucketEnd
                        && o.getExecutedPrice() != null)
                .collect(Collectors.toList());

        if (inBucket.isEmpty()) {
            return flat(bucketStart, fallbackPrice);
        }

        double open = inBucket.get(0).getExecutedPrice().doubleValue();
        double close = inBucket.get(inBucket.size() - 1).getExecutedPrice().doubleValue();
        double high = inBucket.stream().mapToDouble(o -> o.getExecutedPrice().doubleValue()).max().orElse(open);
        double low = inBucket.stream().mapToDouble(o -> o.getExecutedPrice().doubleValue()).min().orElse(open);

        OhlcCandle candle = OhlcCandle.builder()
                .bucketStart(bucketStart)
                .open(open).high(high).low(low).close(close).build();
        applyPrice(candle, fallbackPrice);
        return candle;
    }

    private void applyPrice(OhlcCandle candle, double price) {
        if (price > candle.getHigh()) candle.setHigh(price);
        if (price < candle.getLow()) candle.setLow(price);
        candle.setClose(price);
    }

    private OhlcCandle flat(long bucketStart, double price) {
        return OhlcCandle.builder()
                .bucketStart(bucketStart)
                .open(price).high(price).low(price).close(price).build();
    }
}
