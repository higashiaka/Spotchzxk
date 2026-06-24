package com.spotchzxk.application;

import com.spotchzxk.domain.dividend.entity.DividendLog;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.entity.UserDividendLog;
import com.spotchzxk.domain.user.entity.UserShare;
import com.spotchzxk.domain.dividend.repository.DividendLogRepository;
import com.spotchzxk.domain.user.repository.UserDividendLogRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.math.BigInteger;
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

    private static final BigDecimal FEE_POOL_PAYOUT_RATIO = new BigDecimal("0.35");

    private final UserShareRepository userShareRepository;
    private final UserDividendLogRepository userDividendLogRepository;
    private final DividendLogRepository dividendLogRepository;
    private final StockRepository stockRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final TradeEngine tradeEngine;

    @Transactional
    public void payIntervalDividend(Stock stock) {
        // Re-fetch within transaction to avoid draining a stale feePool from cache
        Stock fresh = stockRepository.findById(stock.getChannelId())
                .orElseThrow(() -> new IllegalStateException("종목을 찾을 수 없습니다."));

        BigDecimal eligibleShares = userShareRepository.sumPreStreamQuantityByChannel(fresh.getChannelId());
        if (eligibleShares.compareTo(BigDecimal.ZERO) <= 0) return;

        BigInteger feePool = fresh.getFeePool();
        if (feePool.signum() <= 0) return;

        BigDecimal totalPayout = new BigDecimal(feePool)
                .multiply(FEE_POOL_PAYOUT_RATIO)
                .setScale(0, RoundingMode.FLOOR);
        if (totalPayout.compareTo(BigDecimal.ZERO) <= 0) return;

        BigDecimal ratePerShare = totalPayout
                .divide(eligibleShares, 12, RoundingMode.FLOOR);

        if (ratePerShare.compareTo(BigDecimal.ZERO) <= 0) return;

        int updatedUsers = userShareRepository.distributeDividends(fresh.getChannelId(), ratePerShare);

        if (updatedUsers > 0) {
            fresh.drainFeePool(totalPayout.toBigIntegerExact());
            stockRepository.save(fresh);

            List<UserShare> shares = userShareRepository.findByStockChannelIdWithPositiveQuantity(fresh.getChannelId());
            List<UserDividendLog> logs = shares.stream()
                    .filter(us -> us.getQuantity().compareTo(BigDecimal.ZERO) > 0
                            && !"__house__".equals(us.getUser().getId())
                            && !us.getUser().isBot())
                    .map(us -> {
                        BigDecimal dividendQty = us.getQuantity();
                        return UserDividendLog.builder()
                                .userId(us.getUser().getId())
                                .channelId(fresh.getChannelId())
                                .streamerName(fresh.getStreamerName())
                                .profileImageUrl(fresh.getProfileImageUrl())
                                .quantity(dividendQty)
                                .ratePerShare(ratePerShare)
                                .amount(ratePerShare.multiply(dividendQty)
                                        .setScale(2, RoundingMode.HALF_UP))
                                .build();
                    })
                    .collect(Collectors.toList());
            userDividendLogRepository.saveAll(logs);

            // Evict user caches after transaction commits
            evictUserCachesAfterCommit(logs.stream()
                    .map(UserDividendLog::getUserId)
                    .collect(Collectors.toCollection(LinkedHashSet::new)));

            BigDecimal actualPaid = totalPayout;
            DividendLog logEntry = DividendLog.builder()
                    .stock(stock)
                    .totalDividendPool(actualPaid)
                    .payoutReason("interval")
                    .streamMinutes(null)
                    .build();
            dividendLogRepository.save(logEntry);

            log.debug("Interval dividend for channel {}: feePool={}, totalPayout={}, ratePerShare={}, eligibleShares={}, {} users",
                    fresh.getChannelId(), feePool, totalPayout, ratePerShare, eligibleShares, updatedUsers);

            // STOMP messages must be sent after commit so the frontend REST fetch sees the new records
            final String now = LocalDateTime.now().toString();
            final Map<String, Object> globalPayload = Map.of(
                    "channelId", fresh.getChannelId(),
                    "streamerName", fresh.getStreamerName(),
                    "profileImageUrl", fresh.getProfileImageUrl() != null ? fresh.getProfileImageUrl() : "",
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
                            "quantity", ul.getQuantity().abs(),
                            "ratePerShare", ul.getRatePerShare().abs(),
                            "amount", ul.getAmount().abs(),
                            "createdAt", ul.getCreatedAt() != null ? ul.getCreatedAt().toString() : now
                    ))
                    .collect(Collectors.<Map<String, Object>>toList());
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
