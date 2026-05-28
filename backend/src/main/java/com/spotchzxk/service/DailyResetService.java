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

import java.util.List;

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
    @Scheduled(cron = "0 0 0 * * *")
    @Transactional
    public void performDailyReset() {
        log.info("Starting daily reset at midnight...");
        List<Stock> stocks = stockRepository.findAll();
        
        stocks.forEach(stock -> {
            stock.setBasePrice(stock.getCurrentPrice());
            stock.setDailyVolume(0L);
        });
        stockRepository.saveAll(stocks);

        userRepository.resetAllRankingStats();

        // Broadcast the reset stocks list to all clients instantly
        messagingTemplate.convertAndSend("/topic/streamers", stockRepository.findAll());
        log.info("Daily reset completed successfully. Updated {} stocks.", stocks.size());
    }
}
