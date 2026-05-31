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

        boolean anyChanged = false;
        List<Stock> pollingOrder = stocks.stream()
                .sorted(Comparator.comparing(Stock::isLive).reversed())
                .toList();
        for (Stock stock : pollingOrder) {
            String status = chzzkApiClient.fetchChannelStatus(stock.getChannelId());
            if (status == null) {
                continue;
            }

            try {
                anyChanged |= Boolean.TRUE.equals(transactionTemplate.execute(tx ->
                        handleLiveTransition(stock, status)));
            } catch (Exception e) {
                log.error("Failed to handle live transition for channel {}: {}",
                        stock.getChannelId(), e.getMessage(), e);
            }
        }

        if (anyChanged) {
            messagingTemplate.convertAndSend("/topic/streamers", stocks);
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
            payIntervalIfDue(stock);
            stockRepository.save(stock);
            return true;
        }
        if (wasLive) {
            markStreamEnded(stock, status, isBlocked);
            return true;
        }
        return false;
    }

    private void markStreamStarted(Stock stock) {
        stock.startLive(LocalDateTime.now());
        userShareRepository.snapshotPreStreamQuantities(stock.getChannelId());
        long preStreamFloat = userShareRepository.sumPreStreamQuantityByChannel(stock.getChannelId());
        stock.updatePreStreamFloat(preStreamFloat);
        stockRepository.save(stock);
        log.info("Stream started: channel={}, pre-stream snapshot taken, preStreamFloat={}",
                stock.getChannelId(), preStreamFloat);
    }

    private void markStreamEnded(Stock stock, String status, boolean isBlocked) {
        if (isBlocked) {
            log.warn("Channel {} ended with BLOCK. No dividend paid.", stock.getChannelId());
        }
        stock.endLive();
        stockRepository.save(stock);
        log.info("Stream ended ({}): channel={}", status, stock.getChannelId());
    }

    private void payIntervalIfDue(Stock stock) {
        if (stock.getLiveStartedAt() == null) {
            return;
        }

        long elapsedMinutes = ChronoUnit.MINUTES.between(stock.getLiveStartedAt(), LocalDateTime.now());
        long completedIntervals = elapsedMinutes / 10;
        long alreadyPaid = stock.getDividendAccumulationCount();

        if (completedIntervals <= alreadyPaid) {
            return;
        }

        long newIntervals = completedIntervals - alreadyPaid;
        for (long i = 0; i < newIntervals; i++) {
            dividendService.payIntervalDividend(stock);
        }
        stock.updateDividendAccumulation(completedIntervals);
        log.info("Interval dividend paid for channel {}: intervals {} -> {}",
                stock.getChannelId(), alreadyPaid, completedIntervals);
    }
}
