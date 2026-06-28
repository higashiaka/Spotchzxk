package com.spotchzxk.application;

import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import com.spotchzxk.infrastructure.chzzk.ChzzkApiClient;
import com.spotchzxk.presentation.dto.StockResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChzzkLivePollingService {
    private static final String SUSPENSION_REASON_API_UNAVAILABLE = "API_UNAVAILABLE";


    private static final int MAX_DIVIDEND_PAYOUTS_PER_TICK = 1;
    private static final long DIVIDEND_INTERVAL_MINUTES = 60L;
    private static final String EVENT_CHANNEL_PREFIX = "event-";
    private static final int SUSPEND_THRESHOLD = 3;

    private final StockRepository stockRepository;
    private final DividendService dividendService;
    private final SimpMessagingTemplate messagingTemplate;
    private final UserShareRepository userShareRepository;
    private final ChzzkApiClient chzzkApiClient;
    private final TransactionTemplate transactionTemplate;
    private final StockSplitService stockSplitService;

    private final ExecutorService pollingExecutor = Executors.newFixedThreadPool(50);
    private final ConcurrentHashMap<String, Stock> liveStockCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Integer> apiFailureCount = new ConcurrentHashMap<>();

    @PostConstruct
    public void initLiveStockCache() {
        stockRepository.findByIsLiveTrue().forEach(s -> liveStockCache.put(s.getChannelId(), s));
        log.info("Live stock cache initialized: {} stocks", liveStockCache.size());
        // Restore failure counters for already-suspended channels so they stay suspended across restarts
        stockRepository.findAll().stream()
                .filter(s -> s.isTradingSuspended() && !isEventStock(s))
                .forEach(s -> apiFailureCount.put(s.getChannelId(), SUSPEND_THRESHOLD));
    }

    @PreDestroy
    public void shutdown() {
        pollingExecutor.shutdown();
        try {
            if (!pollingExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                pollingExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            pollingExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    @Scheduled(fixedDelay = 60_000)
    public void pollLiveStatus() {
        List<Stock> stocks = stockRepository.findAll();
        if (stocks.isEmpty()) {
            return;
        }

        // Issue #15: parallel API calls via CompletableFuture; live stocks polled first to minimize delay
        List<Stock> pollingOrder = stocks.stream()
                .filter(stock -> !isEventStock(stock))
                .sorted(Comparator.comparing(Stock::isLive).reversed())
                .toList();
        List<CompletableFuture<Void>> futures = pollingOrder.stream()
                .map(stock -> CompletableFuture.runAsync(() -> {
                    try {
                        String status = chzzkApiClient.fetchChannelStatus(stock.getChannelId());
                        if ("AUTH_FAILED".equals(status) || "TIMEOUT".equals(status)) {
                            // System-wide cookie expiry or network timeout — unrelated to channel state
                            return;
                        }
                        if ("INACTIVE".equals(status)) {
                            // content:null = channel deleted or long-inactive
                            handleApiFailure(stock);
                            return;
                        }
                        handleApiRecovery(stock);
                        boolean changed = Boolean.TRUE.equals(transactionTemplate.execute(tx ->
                                handleLiveTransition(stock, status)));
                        if (changed) {
                            stockRepository.findById(stock.getChannelId()).ifPresent(s -> {
                                if (s.isLive()) {
                                    liveStockCache.put(s.getChannelId(), s);
                                } else {
                                    liveStockCache.remove(s.getChannelId());
                                }
                                messagingTemplate.convertAndSend("/topic/streamers", List.of(StockResponse.from(s)));
                            });
                        }
                    } catch (Exception e) {
                        log.error("Failed to handle live transition for channel {}: {}",
                                stock.getChannelId(), e.getMessage(), e);
                    }
                }, pollingExecutor))
                .toList();
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
    }

    private boolean handleLiveTransition(Stock stock, String status) {
        boolean isLiveNow = "OPEN".equals(status);
        boolean isBlocked = "BLOCK".equals(status);
        boolean wasLive = stock.isLive();

        if (!wasLive && isLiveNow) {
            markStreamStarted(stock);
            return true;
        }
        if (wasLive && isLiveNow) {
            return false;
        }
        if (wasLive) {
            markStreamEnded(stock, status, isBlocked);
            return true;
        }
        return false;
    }

    @Scheduled(fixedDelay = 1_000)
    public void payDueIntervalDividends() {
        if (stockSplitService.isSplitInProgress()) {
            return;
        }
        int paidCount = 0;
        List<Stock> dueStocks = new ArrayList<>(liveStockCache.values()).stream()
                .filter(stock -> !isEventStock(stock))
                .filter(this::needsDividendIntervalUpdate)
                .sorted(Comparator.comparing(s ->
                        s.getLiveStartedAt().plusMinutes(effectiveDividendIntervalCount(s) * DIVIDEND_INTERVAL_MINUTES)))
                .toList();

        for (Stock stock : dueStocks) {
            if (paidCount >= MAX_DIVIDEND_PAYOUTS_PER_TICK) {
                return;
            }

            try {
                Stock paidStock = transactionTemplate.execute(tx ->
                        stockRepository.findById(stock.getChannelId())
                                .filter(Stock::isLive)
                                .map(freshStock -> payIntervalIfDue(freshStock) ? freshStock : null)
                                .orElse(null));
                if (paidStock != null) {
                    liveStockCache.put(paidStock.getChannelId(), paidStock);
                    paidCount++;
                    messagingTemplate.convertAndSend("/topic/streamers", List.of(StockResponse.from(paidStock)));
                }
            } catch (Exception e) {
                log.error("Failed to pay interval dividend for channel {}: {}",
                        stock.getChannelId(), e.getMessage(), e);
            }
        }
    }

    private boolean needsDividendIntervalUpdate(Stock stock) {
        if (stock.getLiveStartedAt() == null) {
            return false;
        }
        long completedIntervals = completedDividendIntervals(stock);
        long recordedIntervals = stock.getDividendAccumulationCount();
        return completedIntervals != recordedIntervals;
    }

    private boolean isEventStock(Stock stock) {
        return stock.getChannelId() != null && stock.getChannelId().startsWith(EVENT_CHANNEL_PREFIX);
    }

    private void markStreamStarted(Stock stock) {
        Stock fresh = stockRepository.findById(stock.getChannelId()).orElseThrow();
        fresh.startLive(LocalDateTime.now());
        userShareRepository.snapshotPreStreamQuantities(fresh.getChannelId());
        BigDecimal preStreamFloat = userShareRepository.sumPreStreamQuantityByChannel(fresh.getChannelId());
        fresh.updatePreStreamFloat(preStreamFloat);
        stockRepository.save(fresh);
        log.debug("Stream started: channel={}, pre-stream snapshot taken, preStreamFloat={}",
                fresh.getChannelId(), preStreamFloat);
    }

    private void markStreamEnded(Stock stock, String status, boolean isBlocked) {
        if (isBlocked) {
            log.warn("Channel {} ended with BLOCK. No dividend paid.", stock.getChannelId());
        }
        Stock fresh = stockRepository.findById(stock.getChannelId()).orElseThrow();
        fresh.endLive();
        stockRepository.save(fresh);
        log.debug("Stream ended ({}): channel={}", status, fresh.getChannelId());
    }

    private boolean payIntervalIfDue(Stock stock) {
        if (stock.getLiveStartedAt() == null) {
            return false;
        }

        long completedIntervals = completedDividendIntervals(stock);
        long alreadyPaid = stock.getDividendAccumulationCount();

        if (alreadyPaid > completedIntervals) {
            stock.updateDividendAccumulation(completedIntervals);
            stockRepository.save(stock);
            log.debug("Dividend interval count normalized for channel {}: intervals {} -> {}",
                    stock.getChannelId(), alreadyPaid, completedIntervals);
            return true;
        }

        if (completedIntervals <= alreadyPaid) {
            return false;
        }

        long processedIntervals = alreadyPaid;
        long newIntervals = completedIntervals - alreadyPaid;
        for (long i = 0; i < newIntervals; i++) {
            DividendPayoutResult result = dividendService.payIntervalDividend(stock);
            if (!result.countAsProcessed()) {
                log.warn("Dividend interval not counted for channel {}: reason={}",
                        stock.getChannelId(), result.reason());
                break;
            }
            processedIntervals++;
        }
        if (processedIntervals == alreadyPaid) {
            return false;
        }
        stock.updateDividendAccumulation(processedIntervals);
        stockRepository.save(stock);
        log.debug("Interval dividend paid for channel {}: intervals {} -> {}",
                stock.getChannelId(), alreadyPaid, processedIntervals);
        return true;
    }

    private long completedDividendIntervals(Stock stock) {
        long elapsedMinutes = ChronoUnit.MINUTES.between(stock.getLiveStartedAt(), LocalDateTime.now());
        return Math.max(0, elapsedMinutes / DIVIDEND_INTERVAL_MINUTES);
    }

    private long effectiveDividendIntervalCount(Stock stock) {
        return Math.min(stock.getDividendAccumulationCount(), completedDividendIntervals(stock));
    }

    private void handleApiFailure(Stock stock) {
        String channelId = stock.getChannelId();
        int failures = apiFailureCount.merge(channelId, 1, Integer::sum);
        if (failures >= SUSPEND_THRESHOLD) {
            transactionTemplate.executeWithoutResult(tx ->
                    stockRepository.findById(channelId).ifPresent(s -> {
                        if (!s.isTradingSuspended()) {
                            s.suspendTrading(SUSPENSION_REASON_API_UNAVAILABLE);
                            stockRepository.save(s);
                            messagingTemplate.convertAndSend("/topic/streamers", List.of(StockResponse.from(s)));
                            log.warn("Trading suspended for channel {} after {} consecutive API failures.", channelId, failures);
                        }
                    }));
        }
    }

    private void handleApiRecovery(Stock stock) {
        String channelId = stock.getChannelId();
        int prev = apiFailureCount.getOrDefault(channelId, 0);
        apiFailureCount.remove(channelId);
        if (prev >= SUSPEND_THRESHOLD) {
            transactionTemplate.executeWithoutResult(tx ->
                    stockRepository.findById(channelId).ifPresent(s -> {
                        if (s.isTradingSuspended()
                                && SUSPENSION_REASON_API_UNAVAILABLE.equals(s.getTradingSuspensionReason())) {
                            s.resumeTrading();
                            stockRepository.save(s);
                            messagingTemplate.convertAndSend("/topic/streamers", List.of(StockResponse.from(s)));
                            log.debug("Trading resumed for channel {} (API recovered).", channelId);
                        }
                    }));
        }
    }
}


