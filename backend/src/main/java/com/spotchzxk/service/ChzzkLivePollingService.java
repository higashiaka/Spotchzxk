package com.spotchzxk.service;

import com.spotchzxk.entity.Stock;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChzzkLivePollingService {

    private static final int MAX_DIVIDEND_PAYOUTS_PER_TICK = 1;
    private static final long DIVIDEND_INTERVAL_MINUTES = 60L;
    private static final String EVENT_CHANNEL_PREFIX = "event-";

    private final StockRepository stockRepository;
    private final DividendService dividendService;
    private final SimpMessagingTemplate messagingTemplate;
    private final UserShareRepository userShareRepository;
    private final ChzzkApiClient chzzkApiClient;
    private final TransactionTemplate transactionTemplate;
    @Scheduled(fixedDelay = 60_000)
    public void pollLiveStatus() {
        List<Stock> stocks = stockRepository.findAll();
        if (stocks.isEmpty()) {
            return;
        }

        List<Stock> pollingOrder = stocks.stream()
                .filter(stock -> !isEventStock(stock))
                .sorted(Comparator.comparing(Stock::isLive).reversed())
                .toList();
        for (Stock stock : pollingOrder) {
            String status = chzzkApiClient.fetchChannelStatus(stock.getChannelId());
            if (status == null) {
                continue;
            }

            try {
                boolean changed = Boolean.TRUE.equals(transactionTemplate.execute(tx ->
                        handleLiveTransition(stock, status)));
                if (changed) {
                    stockRepository.findById(stock.getChannelId()).ifPresent(s ->
                            messagingTemplate.convertAndSend("/topic/streamers", List.of(s)));
                }
            } catch (Exception e) {
                log.error("Failed to handle live transition for channel {}: {}",
                        stock.getChannelId(), e.getMessage(), e);
            }
        }
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
        int paidCount = 0;
        List<Stock> dueStocks = stockRepository.findByIsLiveTrue().stream()
                .filter(stock -> !isEventStock(stock))
                .filter(this::needsDividendIntervalUpdate)
                .sorted(Comparator.comparing(s ->
                        s.getLiveStartedAt().plusMinutes(effectiveDividendIntervalCount(s) * DIVIDEND_INTERVAL_MINUTES)))
                .toList();

        for (Stock stock : dueStocks) {
            if (paidCount >= MAX_DIVIDEND_PAYOUTS_PER_TICK) {
                return;
            }

            String status = chzzkApiClient.fetchChannelStatus(stock.getChannelId());
            if (!"OPEN".equals(status)) {
                continue;
            }

            try {
                Stock paidStock = transactionTemplate.execute(tx ->
                        stockRepository.findById(stock.getChannelId())
                                .filter(Stock::isLive)
                                .map(freshStock -> payIntervalIfDue(freshStock) ? freshStock : null)
                                .orElse(null));
                if (paidStock != null) {
                    paidCount++;
                    messagingTemplate.convertAndSend("/topic/streamers", List.of(paidStock));
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
        long preStreamFloat = userShareRepository.sumPreStreamQuantityByChannel(fresh.getChannelId());
        fresh.updatePreStreamFloat(preStreamFloat);
        stockRepository.save(fresh);
        log.info("Stream started: channel={}, pre-stream snapshot taken, preStreamFloat={}",
                fresh.getChannelId(), preStreamFloat);
    }

    private void markStreamEnded(Stock stock, String status, boolean isBlocked) {
        if (isBlocked) {
            log.warn("Channel {} ended with BLOCK. No dividend paid.", stock.getChannelId());
        }
        Stock fresh = stockRepository.findById(stock.getChannelId()).orElseThrow();
        fresh.endLive();
        stockRepository.save(fresh);
        log.info("Stream ended ({}): channel={}", status, fresh.getChannelId());
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
            log.info("Dividend interval count normalized for channel {}: intervals {} -> {}",
                    stock.getChannelId(), alreadyPaid, completedIntervals);
            return true;
        }

        if (completedIntervals <= alreadyPaid) {
            return false;
        }

        long newIntervals = completedIntervals - alreadyPaid;
        for (long i = 0; i < newIntervals; i++) {
            dividendService.payIntervalDividend(stock);
        }
        stock.updateDividendAccumulation(completedIntervals);
        stockRepository.save(stock);
        log.info("Interval dividend paid for channel {}: intervals {} -> {}",
                stock.getChannelId(), alreadyPaid, completedIntervals);
        return true;
    }

    private long completedDividendIntervals(Stock stock) {
        long elapsedMinutes = ChronoUnit.MINUTES.between(stock.getLiveStartedAt(), LocalDateTime.now());
        return Math.max(0, elapsedMinutes / DIVIDEND_INTERVAL_MINUTES);
    }

    private long effectiveDividendIntervalCount(Stock stock) {
        return Math.min(stock.getDividendAccumulationCount(), completedDividendIntervals(stock));
    }
}
