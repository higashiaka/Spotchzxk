package com.spotchzxk.application;

import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import com.spotchzxk.presentation.dto.StockResponse;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class DailyResetService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final String DAILY_RESET_STATE_KEY = "last_daily_reset_date";

    private final StockRepository stockRepository;
    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;

    @PostConstruct
    public void catchUpMissedDailyReset() {
        ensureDailyResetCompleted("startup");
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    public void ensureDailyResetCompleted() {
        ensureDailyResetCompleted("watchdog");
    }

    private void ensureDailyResetCompleted(String source) {
        LocalDate today = LocalDate.now(KST);
        Optional<LocalDate> lastResetDate = findLastResetDate();
        if (lastResetDate.isPresent() && !lastResetDate.get().isBefore(today)) {
            return;
        }

        log.warn("Daily reset was not recorded for {}. Running catch-up reset. source={}, lastResetDate={}",
                today, source, lastResetDate.map(LocalDate::toString).orElse("none"));
        transactionTemplate.executeWithoutResult(status -> performDailyReset(false));
    }

    /**
     * Runs automatically at midnight (00:00) daily.
     * Updates base_price (yesterday's close) to current_price,
     * and resets daily_volume/daily_trading_value to 0.
     */
    @Scheduled(cron = "0 0 0 * * *", zone = "Asia/Seoul")
    public void performDailyReset() {
        transactionTemplate.executeWithoutResult(status -> performDailyReset(false));
    }

    public int forceDailyReset() {
        Integer result = transactionTemplate.execute(status -> performDailyReset(true));
        return result != null ? result : 0;
    }

    private int performDailyReset(boolean force) {
        LocalDate today = LocalDate.now(KST);
        Optional<LocalDate> lastResetDate = findLastResetDateForUpdate();
        if (!force && lastResetDate.isPresent() && !lastResetDate.get().isBefore(today)) {
            log.info("Daily reset already completed for {}. Skipping.", today);
            return 0;
        }

        log.info("Starting daily reset for {}. force={}...", today, force);
        int resetStocks = stockRepository.resetDailyMarketStats();

        int resetUsers = userRepository.resetAllRankingStats();
        updateLastResetDate(today);

        String resetAt = LocalDateTime.now(KST).toString();
        sendAfterCommit(() -> {
            Map<String, java.math.BigDecimal> eligibleSharesByChannel = new java.util.HashMap<>();
            for (UserShareRepository.ChannelQuantitySum row : userShareRepository.sumPreStreamQuantityGroupedByChannel()) {
                eligibleSharesByChannel.put(row.getChannelId(), row.getTotal());
            }
            messagingTemplate.convertAndSend("/topic/streamers",
                    stockRepository.findAll().stream()
                            .map(s -> StockResponse.from(s, eligibleSharesByChannel.get(s.getChannelId())))
                            .toList());
            messagingTemplate.convertAndSend("/topic/rankings-reset", Map.of(
                "resetAt", resetAt,
                "resetUsers", resetUsers
            ));
        });
        log.info("Daily reset completed successfully. Updated {} stocks and reset {} users ranking stats.",
                resetStocks, resetUsers);
        return resetStocks;
    }

    private Optional<LocalDate> findLastResetDate() {
        try {
            List<String> values = jdbcTemplate.queryForList(
                    "SELECT state_value FROM app_state WHERE state_key = ?",
                    String.class,
                    DAILY_RESET_STATE_KEY
            );
            return values.stream().findFirst().map(LocalDate::parse);
        } catch (DataAccessException e) {
            log.warn("Daily reset state is unavailable; skipping catch-up check. message={}", e.getMessage());
            return Optional.of(LocalDate.now(KST));
        }
    }

    private Optional<LocalDate> findLastResetDateForUpdate() {
        List<String> values = jdbcTemplate.queryForList(
                "SELECT state_value FROM app_state WHERE state_key = ? FOR UPDATE",
                String.class,
                DAILY_RESET_STATE_KEY
        );
        return values.stream().findFirst().map(LocalDate::parse);
    }

    private void updateLastResetDate(LocalDate date) {
        int updated = jdbcTemplate.update(
                "UPDATE app_state SET state_value = ? WHERE state_key = ?",
                date.toString(),
                DAILY_RESET_STATE_KEY
        );
        if (updated == 0) {
            jdbcTemplate.update(
                    "INSERT INTO app_state (state_key, state_value) VALUES (?, ?)",
                    DAILY_RESET_STATE_KEY,
                    date.toString()
            );
        }
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
