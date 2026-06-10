package com.spotchzxk.service;

import com.spotchzxk.entity.DividendLog;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.entity.UserDividendLog;
import com.spotchzxk.entity.UserShare;
import com.spotchzxk.repository.DividendLogRepository;
import com.spotchzxk.repository.UserDividendLogRepository;
import com.spotchzxk.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class DividendService {

    // Issue #7: BACKEND_OVERVIEW.md 기준 0.7% — 기존 0.0001(0.01%)은 문서 대비 1/70 수준
    private static final BigDecimal DIVIDEND_RATE = new BigDecimal("0.007");

    private final UserShareRepository userShareRepository;
    private final UserDividendLogRepository userDividendLogRepository;
    private final DividendLogRepository dividendLogRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final TradeEngine tradeEngine;

    @Transactional
    public void payIntervalDividend(Stock stock) {
        long eligibleShares = userShareRepository.sumPreStreamQuantityByChannel(stock.getChannelId());
        if (eligibleShares <= 0) return;

        BigDecimal ratePerShare = BigDecimal.valueOf(stock.getCurrentPrice())
                .multiply(DIVIDEND_RATE)
                .setScale(4, RoundingMode.HALF_UP);

        if (ratePerShare.compareTo(BigDecimal.ZERO) <= 0) return;

        int updatedUsers = userShareRepository.distributeDividends(stock.getChannelId(), ratePerShare);

        if (updatedUsers > 0) {
            List<UserShare> shares = userShareRepository.findByStockChannelIdWithPositiveQuantity(stock.getChannelId());
            List<UserDividendLog> logs = shares.stream()
                    .filter(us -> us.getPreStreamQuantity() > 0
                            && !"__house__".equals(us.getUser().getId())
                            && !us.getUser().isBot())
                    .map(us -> {
                        long dividendQty = us.getPreStreamQuantity();
                        return UserDividendLog.builder()
                                .userId(us.getUser().getId())
                                .channelId(stock.getChannelId())
                                .streamerName(stock.getStreamerName())
                                .profileImageUrl(stock.getProfileImageUrl())
                                .quantity(dividendQty)
                                .ratePerShare(ratePerShare)
                                .amount(ratePerShare.multiply(BigDecimal.valueOf(dividendQty))
                                        .setScale(2, RoundingMode.HALF_UP))
                                .build();
                    })
                    .collect(Collectors.toList());
            userDividendLogRepository.saveAll(logs);

            // Evict user caches after transaction commits
            evictUserCachesAfterCommit(logs.stream()
                    .map(UserDividendLog::getUserId)
                    .collect(Collectors.toCollection(LinkedHashSet::new)));

            BigDecimal actualPaid = ratePerShare.multiply(BigDecimal.valueOf(eligibleShares))
                    .setScale(2, RoundingMode.HALF_UP);
            DividendLog logEntry = DividendLog.builder()
                    .stock(stock)
                    .totalDividendPool(actualPaid)
                    .payoutReason("interval")
                    .streamMinutes(null)
                    .build();
            dividendLogRepository.save(logEntry);

            log.info("Interval dividend for channel {}: price={}, ratePerShare={}, eligibleShares={}, {} users",
                    stock.getChannelId(), stock.getCurrentPrice(), ratePerShare, eligibleShares, updatedUsers);

            // STOMP messages must be sent after commit so the frontend REST fetch sees the new records
            final String now = LocalDateTime.now().toString();
            final Map<String, Object> globalPayload = Map.of(
                    "channelId", stock.getChannelId(),
                    "streamerName", stock.getStreamerName(),
                    "profileImageUrl", stock.getProfileImageUrl() != null ? stock.getProfileImageUrl() : "",
                    "totalDividendPool", actualPaid,
                    "streamMinutes", 0L,
                    "createdAt", now
            );
            // Per-user personal dividend notification payloads
            final List<Map<String, Object>> userPayloads = logs.stream()
                    .map(ul -> Map.<String, Object>of(
                            "channelId", ul.getChannelId(),
                            "streamerName", ul.getStreamerName(),
                            "profileImageUrl", ul.getProfileImageUrl() != null ? ul.getProfileImageUrl() : "",
                            "quantity", Math.abs(ul.getQuantity()),
                            "ratePerShare", ul.getRatePerShare().abs(),
                            "amount", ul.getAmount().abs(),
                            "createdAt", ul.getCreatedAt() != null ? ul.getCreatedAt().toString() : now
                    ))
                    .collect(Collectors.toList());
            final List<String> userIds = logs.stream()
                    .map(UserDividendLog::getUserId)
                    .collect(Collectors.toList());

            sendAfterCommit(() -> {
                // Broadcast to global dividend feed
                messagingTemplate.convertAndSend("/topic/dividends", globalPayload);
                // Send personal dividend entry to each user in real-time
                for (int i = 0; i < userIds.size(); i++) {
                    messagingTemplate.convertAndSend("/topic/user-dividends/" + userIds.get(i), userPayloads.get(i));
                }
            });
        }
    }

    private void evictUserCachesAfterCommit(Set<String> userIds) {
        if (userIds.isEmpty()) return;

        Runnable evictCaches = () -> userIds.forEach(tradeEngine::evictUserCache);
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            evictCaches.run();
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                evictCaches.run();
            }
        });
    }

    /** Runs the given task after the current transaction commits.
     *  Falls back to immediate execution if no active transaction. */
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
