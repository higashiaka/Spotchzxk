package com.spotchzxk.application;

import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.entity.StockSplitEvent;
import com.spotchzxk.domain.stock.entity.StockSplitNotice;
import com.spotchzxk.domain.trading.policy.AntiWhalePolicy;
import com.spotchzxk.domain.order.repository.OrderRepository;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.stock.repository.StockSplitEventRepository;
import com.spotchzxk.domain.stock.repository.StockSplitNoticeRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class StockSplitService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final long SPLIT_THRESHOLD_PRICE = 1_000_000L;
    private static final int SPLIT_RATIO = 10;
    private static final String EVENT_CHANNEL_PREFIX = "event-";

    private final StockRepository stockRepository;
    private final UserShareRepository userShareRepository;
    private final OrderRepository orderRepository;
    private final StockSplitEventRepository stockSplitEventRepository;
    private final StockSplitNoticeRepository stockSplitNoticeRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final TradeEngine tradeEngine;
    private final CandleService candleService;

    @Scheduled(cron = "0 0 0/6 * * *", zone = "Asia/Seoul")
    @Transactional
    public void performDailyStockSplit() {
        LocalDateTime now = LocalDateTime.now(KST);
        LocalDate today = now.toLocalDate();
        int splitHour = now.getHour();
        if (stockSplitNoticeRepository.existsBySplitDateAndSplitHour(today, splitHour)) {
            log.info("Stock split already processed for {} {}:00.", today, splitHour);
            return;
        }

        LocalDateTime splitEligibleListedAt = now.minusHours(AntiWhalePolicy.NEW_LISTING_HOURS);
        List<Stock> targets = stockRepository.findByCurrentPriceGreaterThan(SPLIT_THRESHOLD_PRICE).stream()
                .filter(stock -> !isEventStock(stock))
                .filter(stock -> stock.getListedAt() == null || !stock.getListedAt().isAfter(splitEligibleListedAt))
                .sorted(Comparator.comparing(Stock::getStreamerName))
                .toList();
        if (targets.isEmpty()) {
            log.info("No stocks exceeded the split threshold of {}.", SPLIT_THRESHOLD_PRICE);
            return;
        }

        StockSplitNotice notice = createNotice(today, splitHour, targets);
        stockSplitNoticeRepository.saveAndFlush(notice);

        List<String> splitChannelIds = targets.stream().map(Stock::getChannelId).toList();
        for (Stock stock : targets) {
            stock.applyStockSplit(SPLIT_RATIO);
            userShareRepository.applyStockSplit(stock.getChannelId(), SPLIT_RATIO);
            orderRepository.applyPendingStockSplit(stock.getChannelId(), SPLIT_RATIO);
        }
        stockRepository.saveAll(targets);
        // Evict caches after commit so other threads never read stale pre-split state
        registerAfterCommit(() -> {
            splitChannelIds.forEach(id -> {
                tradeEngine.evictStockCache(id);
                candleService.evictStockCache(id);
            });
            tradeEngine.evictAllPortfolioCaches();
        });

        long executedAt = System.currentTimeMillis();
        LocalDateTime createdAt = now;
        List<StockSplitEvent> events = targets.stream()
                .map(stock -> StockSplitEvent.builder()
                        .id(UUID.randomUUID().toString())
                        .channelId(stock.getChannelId())
                        .splitRatio(SPLIT_RATIO)
                        .executedAt(executedAt)
                        .createdAt(createdAt)
                        .build())
                .toList();
        stockSplitEventRepository.saveAll(events);

        List<Map<String, Object>> priceUpdates = targets.stream()
                .map(stock -> Map.<String, Object>of(
                        "channelId", stock.getChannelId(),
                        "price", stock.getCurrentPrice()
                ))
                .toList();
        registerAfterCommit(() -> {
            messagingTemplate.convertAndSend("/topic/streamers", stockRepository.findAll());
            for (Map<String, Object> priceUpdate : priceUpdates) {
                String channelId = (String) priceUpdate.get("channelId");
                messagingTemplate.convertAndSend("/topic/prices/" + channelId,
                        Map.of("streamerId", channelId, "price", priceUpdate.get("price")));
            }
            messagingTemplate.convertAndSend("/topic/stock-split-notices", notice);
        });

        log.info("Applied {}:1 stock split to {} stocks: {}",
                SPLIT_RATIO,
                targets.size(),
                targets.stream().map(Stock::getStreamerName).collect(Collectors.joining(", ")));
    }

    @Transactional(readOnly = true)
    public StockSplitNotice getLatestNotice() {
        return stockSplitNoticeRepository.findTopBySplitDateOrderByCreatedAtDesc(LocalDate.now(KST)).orElse(null);
    }

    private StockSplitNotice createNotice(LocalDate today, int splitHour, List<Stock> targets) {
        String stockNames = targets.stream()
                .map(Stock::getStreamerName)
                .collect(Collectors.joining(", "));
        return StockSplitNotice.builder()
                .id(UUID.randomUUID().toString())
                .splitDate(today)
                .splitHour(splitHour)
                .thresholdPrice((int) SPLIT_THRESHOLD_PRICE)
                .splitRatio(SPLIT_RATIO)
                .stockCount(targets.size())
                .stockNames(stockNames)
                .createdAt(LocalDateTime.now(KST))
                .build();
    }

    private boolean isEventStock(Stock stock) {
        return stock.getChannelId() != null && stock.getChannelId().startsWith(EVENT_CHANNEL_PREFIX);
    }

    private void registerAfterCommit(Runnable task) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            task.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                task.run();
            }
        });
    }
}


