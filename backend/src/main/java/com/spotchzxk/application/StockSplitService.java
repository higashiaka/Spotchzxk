package com.spotchzxk.application;

import com.spotchzxk.domain.order.repository.OrderRepository;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.presentation.dto.StockResponse;
import com.spotchzxk.domain.stock.entity.StockSplitEvent;
import com.spotchzxk.domain.stock.entity.StockSplitNotice;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.stock.repository.StockSplitEventRepository;
import com.spotchzxk.domain.stock.repository.StockSplitNoticeRepository;
import com.spotchzxk.domain.trading.policy.AntiWhalePolicy;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class StockSplitService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final BigDecimal SPLIT_THRESHOLD_PRICE = BigDecimal.valueOf(1_000_000);
    private static final int SPLIT_RATIO = 10;
    private static final BigDecimal REVERSE_SPLIT_THRESHOLD_PRICE = BigDecimal.valueOf(1_000);
    private static final String EVENT_CHANNEL_PREFIX = "event-";

    private final StockRepository stockRepository;
    private final UserShareRepository userShareRepository;
    private final OrderRepository orderRepository;
    private final StockSplitEventRepository stockSplitEventRepository;
    private final StockSplitNoticeRepository stockSplitNoticeRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final TradeEngine tradeEngine;
    private final CandleService candleService;

    private final AtomicBoolean splitInProgress = new AtomicBoolean(false);

    public boolean isSplitInProgress() {
        return splitInProgress.get();
    }

    @Scheduled(cron = "0 0 0/6 * * *", zone = "Asia/Seoul")
    @Transactional
    public void performDailyStockSplit() {
        if (!splitInProgress.compareAndSet(false, true)) {
            log.warn("Stock split already in progress; skipping scheduled run.");
            return;
        }
        try {
            doPerformSplit(false, false);
        } finally {
            splitInProgress.set(false);
        }
    }

    @Scheduled(cron = "0 0 3/6 * * *", zone = "Asia/Seoul")
    @Transactional
    public void performDailyReverseStockSplit() {
        if (!splitInProgress.compareAndSet(false, true)) {
            log.warn("Reverse stock split already in progress; skipping scheduled run.");
            return;
        }
        try {
            doPerformSplit(false, true);
        } finally {
            splitInProgress.set(false);
        }
    }

    @Transactional
    public String forcePerformSplit() {
        if (!splitInProgress.compareAndSet(false, true)) {
            return "액면분할 진행 중 — 중복 실행 차단됨";
        }
        try {
            int count = doPerformSplit(true, false);
            return count == 0 ? "액면분할 대상 없음" : String.format("액면분할 완료: %d개 종목", count);
        } finally {
            splitInProgress.set(false);
        }
    }

    @Transactional
    public String forcePerformReverseSplit() {
        if (!splitInProgress.compareAndSet(false, true)) {
            return "액면병합 진행 중 — 중복 실행 차단됨";
        }
        try {
            int count = doPerformSplit(true, true);
            return count == 0 ? "액면병합 대상 없음" : String.format("액면병합 완료: %d개 종목", count);
        } finally {
            splitInProgress.set(false);
        }
    }

    private int doPerformSplit(boolean force, boolean reverse) {
        LocalDateTime now = LocalDateTime.now(KST);
        LocalDate today = now.toLocalDate();
        int splitHour = now.getHour();
        if (!force && stockSplitNoticeRepository.existsBySplitDateAndSplitHour(today, splitHour)) {
            log.info("{} already processed for {} {}:00.", actionName(reverse), today, splitHour);
            return 0;
        }

        if (reverse) {
            suspendUnsafePriceStocks(now);
        }
        List<StockAction> actions = findEligibleActions(now, reverse);
        if (actions.isEmpty()) {
            log.info("No stocks met {} threshold.", actionName(reverse));
            return 0;
        }

        StockSplitNotice notice = createNotice(today, splitHour, actions);
        stockSplitNoticeRepository.saveAndFlush(notice);

        for (StockAction action : actions) {
            applyAction(action);
            orderRepository.deleteAllPendingOrders(action.stock().getChannelId());
        }

        List<Stock> targets = actions.stream().map(StockAction::stock).toList();
        stockRepository.saveAll(targets);

        List<String> channelIds = targets.stream().map(Stock::getChannelId).toList();
        registerAfterCommit(() -> {
            channelIds.forEach(id -> {
                tradeEngine.evictStockCache(id);
                candleService.evictStockCache(id);
            });
            tradeEngine.evictAllPortfolioCaches();
        });

        long executedAt = System.currentTimeMillis();
        List<StockSplitEvent> events = actions.stream()
                .map(action -> StockSplitEvent.builder()
                        .id(UUID.randomUUID().toString())
                        .channelId(action.stock().getChannelId())
                        .splitRatio(action.eventRatio())
                        .executedAt(executedAt)
                        .createdAt(now)
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
            messagingTemplate.convertAndSend("/topic/streamers",
                    stockRepository.findAll().stream().map(StockResponse::from).toList());
            for (Map<String, Object> priceUpdate : priceUpdates) {
                String channelId = (String) priceUpdate.get("channelId");
                messagingTemplate.convertAndSend("/topic/prices/" + channelId,
                        Map.of("streamerId", channelId, "price", priceUpdate.get("price")));
            }
            messagingTemplate.convertAndSend("/topic/stock-split-notices", notice);
        });

        log.info("Applied {} to {} stocks: {}",
                actionName(reverse),
                targets.size(),
                actions.stream().map(StockAction::displayName).collect(Collectors.joining(", ")));
        return targets.size();
    }

    @Transactional(readOnly = true)
    public StockSplitNotice getLatestNotice() {
        return stockSplitNoticeRepository.findTopBySplitDateOrderByCreatedAtDesc(LocalDate.now(KST)).orElse(null);
    }

    private List<StockAction> findEligibleActions(LocalDateTime now, boolean reverse) {
        LocalDateTime eligibleListedAt = now.minusHours(AntiWhalePolicy.NEW_LISTING_HOURS);
        if (reverse) {
            return stockRepository.findByCurrentPriceLessThan(REVERSE_SPLIT_THRESHOLD_PRICE).stream()
                    .filter(stock -> isEligibleForNormalization(stock, eligibleListedAt))
                    .filter(stock -> effectiveAmmPrice(stock).compareTo(BigDecimal.ZERO) > 0)
                    .map(stock -> new StockAction(stock, calcReverseSplitRatio(effectiveAmmPrice(stock)), true))
                    .sorted(Comparator.comparing(action -> action.stock().getStreamerName()))
                    .toList();
        }

        return stockRepository.findByCurrentPriceGreaterThan(SPLIT_THRESHOLD_PRICE).stream()
                .filter(stock -> isEligibleForNormalization(stock, eligibleListedAt))
                .filter(stock -> stock.getCurrentPrice()
                        .divide(BigDecimal.valueOf(SPLIT_RATIO), 2, RoundingMode.HALF_UP)
                        .compareTo(REVERSE_SPLIT_THRESHOLD_PRICE) >= 0)
                .map(stock -> new StockAction(stock, SPLIT_RATIO, false))
                .sorted(Comparator.comparing(action -> action.stock().getStreamerName()))
                .toList();
    }

    private boolean isEligibleForNormalization(Stock stock, LocalDateTime eligibleListedAt) {
        return !isEventStock(stock)
                && (stock.getListedAt() == null || !stock.getListedAt().isAfter(eligibleListedAt));
    }

    private void applyAction(StockAction action) {
        Stock stock = action.stock();
        if (action.reverse()) {
            stock.applyReverseStockSplit(action.ratio());
            if (stock.getCurrentPrice().compareTo(BigDecimal.ZERO) > 0) {
                stock.resumeTrading();
            }
            userShareRepository.applyReverseStockSplit(stock.getChannelId(), action.ratio());
            stock.syncIssuedShares(userShareRepository.sumQuantityByStock(stock.getChannelId()));
            return;
        }
        stock.applyStockSplit(action.ratio());
        userShareRepository.applyStockSplit(stock.getChannelId(), action.ratio());
    }

    private StockSplitNotice createNotice(LocalDate today, int splitHour, List<StockAction> actions) {
        boolean reverse = actions.get(0).reverse();
        String stockNames = actions.stream()
                .map(StockAction::displayName)
                .collect(Collectors.joining(", "));
        int representativeRatio = reverse
                ? -actions.stream().mapToInt(StockAction::ratio).max().orElse(10)
                : SPLIT_RATIO;
        return StockSplitNotice.builder()
                .id(UUID.randomUUID().toString())
                .splitDate(today)
                .splitHour(splitHour)
                .thresholdPrice(reverse ? REVERSE_SPLIT_THRESHOLD_PRICE.intValue() : SPLIT_THRESHOLD_PRICE.intValue())
                .splitRatio(representativeRatio)
                .stockCount(actions.size())
                .stockNames(stockNames)
                .createdAt(LocalDateTime.now(KST))
                .build();
    }

    /**
     * Picks a reverse-split ratio that brings a sub-threshold price back toward 1,000 won.
     * Ratios are capped to powers of 10 so they're easy to communicate to users.
     */
    private static int calcReverseSplitRatio(BigDecimal price) {
        // target: post-split price ≥ 1,000
        if (price.compareTo(new BigDecimal("0.001")) < 0)  return 100_000_000;
        if (price.compareTo(new BigDecimal("0.01")) < 0)   return 10_000_000;
        if (price.compareTo(new BigDecimal("0.1")) < 0)    return 1_000_000;
        if (price.compareTo(BigDecimal.ONE) < 0)           return 100_000;
        if (price.compareTo(BigDecimal.TEN) < 0)           return 10_000;
        if (price.compareTo(BigDecimal.valueOf(100)) < 0)  return 1_000;
        return 10;
    }

    private void suspendUnsafePriceStocks(LocalDateTime now) {
        LocalDateTime eligibleListedAt = now.minusHours(AntiWhalePolicy.NEW_LISTING_HOURS);
        List<Stock> targets = stockRepository.findByCurrentPriceLessThan(BigDecimal.ONE).stream()
                .filter(stock -> !stock.isTradingSuspended())
                .filter(stock -> isEligibleForNormalization(stock, eligibleListedAt))
                .filter(stock -> stock.getCurrentPrice().compareTo(BigDecimal.ZERO) <= 0 || !hasValidAmmPool(stock))
                .peek(Stock::suspendTrading)
                .toList();
        if (!targets.isEmpty()) {
            stockRepository.saveAll(targets);
            log.warn("Suspended {} stocks with unsafe price or AMM pool: {}",
                    targets.size(),
                    targets.stream().map(Stock::getChannelId).collect(Collectors.joining(", ")));
        }
    }

    private boolean hasValidAmmPool(Stock stock) {
        return stock.getCoinReserve() != null && stock.getShareReserve() != null
                && stock.getCoinReserve().signum() > 0 && stock.getShareReserve().signum() > 0;
    }

    private BigDecimal effectiveAmmPrice(Stock stock) {
        if (stock.getCurrentPrice() != null && stock.getCurrentPrice().compareTo(BigDecimal.ZERO) > 0) {
            return stock.getCurrentPrice();
        }
        if (!hasValidAmmPool(stock)) {
            return BigDecimal.ZERO;
        }
        return new BigDecimal(stock.getCoinReserve())
                .divide(new BigDecimal(stock.getShareReserve()), 18, RoundingMode.HALF_UP);
    }

    private boolean isEventStock(Stock stock) {
        return stock.getChannelId() != null && stock.getChannelId().startsWith(EVENT_CHANNEL_PREFIX);
    }

    private String actionName(boolean reverse) {
        return reverse ? "reverse stock split" : "stock split";
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

    private record StockAction(Stock stock, int ratio, boolean reverse) {
        int eventRatio() {
            return reverse ? -ratio : ratio;
        }

        String displayName() {
            return stock.getStreamerName() + (reverse ? " (액면병합)" : " (액면분할)");
        }
    }
}
