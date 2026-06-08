package com.spotchzxk.service;

import com.spotchzxk.entity.Stock;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class DailyResetService {

    private final StockRepository stockRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * Runs automatically at midnight (00:00) daily.
     * Updates base_price (yesterday's close) to current_price,
     * and resets daily_volume to 0.
     */
    @Scheduled(cron = "0 0 0 * * *", zone = "Asia/Seoul")
    @Transactional
    public void performDailyReset() {
        log.info("Starting daily reset at midnight...");
        List<Stock> stocks = stockRepository.findAll();
        
        stocks.forEach(Stock::applyDailyReset);
        stockRepository.saveAll(stocks);

        int resetUsers = userRepository.resetAllRankingStats();

        String resetAt = LocalDateTime.now().toString();
        sendAfterCommit(() -> {
            messagingTemplate.convertAndSend("/topic/streamers", stockRepository.findAll());
            messagingTemplate.convertAndSend("/topic/rankings-reset", Map.of(
                "resetAt", resetAt,
                "resetUsers", resetUsers
            ));
        });
        log.info("Daily reset completed successfully. Updated {} stocks and reset {} users ranking stats.",
                stocks.size(), resetUsers);
    }

    private void sendAfterCommit(Runnable task) {
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
