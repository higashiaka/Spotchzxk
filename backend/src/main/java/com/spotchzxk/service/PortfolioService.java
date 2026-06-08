package com.spotchzxk.service;

import com.spotchzxk.entity.User;
import com.spotchzxk.entity.UserShare;
import com.spotchzxk.entity.Order;
import com.spotchzxk.exception.ResetLimitExceededException;
import com.spotchzxk.repository.UserRepository;
import com.spotchzxk.repository.UserShareRepository;
import com.spotchzxk.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.HashMap;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PortfolioService {

    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(1_000_000);
    private static final int MAX_DAILY_RESETS = 3;
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final long RANK_CACHE_TTL_MS = 3 * 60 * 1000L;
    private static final long TOTAL_CACHE_TTL_MS = 10 * 60 * 1000L;

    private final Map<String, long[]> rankCache = new ConcurrentHashMap<>();
    private volatile long[] totalActiveCache;

    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final OrderRepository orderRepository;
    private final TradeEngine tradeEngine;
    private final TransactionTemplate transactionTemplate;

    @Transactional
    public User getOrCreate(String userId) {
        return userRepository.findById(userId).orElseGet(() -> {
            User p = User.builder().id(userId).coinBalance(INITIAL_BALANCE).build();
            return userRepository.save(p);
        });
    }

    public Map<String, Object> getPortfolioResponse(String userId) {
        User p = getOrCreate(userId);
        List<UserShare> userShares = userShareRepository.findByUserId(userId);
        Map<String, Long> shares = userShares.stream()
                .filter(s -> s.getQuantity() > 0)
                .collect(Collectors.toMap(
                        s -> s.getStock().getChannelId(),
                        s -> s.getQuantity()
                ));
        Map<String, BigDecimal> avgPrices = userShares.stream()
                .filter(s -> s.getQuantity() > 0)
                .collect(Collectors.toMap(
                        s -> s.getStock().getChannelId(),
                        s -> s.getAvgPrice() != null ? s.getAvgPrice() : BigDecimal.ZERO
                ));
        Map<String, Object> response = new HashMap<>();
        response.put("balance", p.getCoinBalance());
        response.put("shares", shares);
        response.put("avgPrices", avgPrices);
        response.put("dividendTotal", p.getDividendTotal() != null ? p.getDividendTotal() : BigDecimal.ZERO);
        response.put("displayName", p.getDisplayName());
        response.put("realizedProfit", p.getRealizedProfit() != null ? p.getRealizedProfit() : BigDecimal.ZERO);
        response.put("rankingNicknamePublic", p.isRankingNicknamePublic());
        response.put("nicknameChangeTickets", p.getNicknameChangeTickets());
        response.put("stockAddTickets", p.getStockAddTickets());
        if (!p.isGuest()) {
            response.put("leagueRank", cachedLeagueRank(userId));
            response.put("leagueTotal", cachedLeagueTotal());
        }
        return response;
    }

    public void resetPortfolio(String userId) {
        tradeEngine.runWithUserLock(userId, () -> transactionTemplate.executeWithoutResult(status ->
                resetPortfolioLocked(userId)));
    }

    private void resetPortfolioLocked(String userId) {
        User p = getOrCreate(userId);

        List<UserShare> shares = userShareRepository.findByUserId(userId);
        boolean hasShares = shares.stream().anyMatch(s -> s.getQuantity() > 0);
        if (hasShares) {
            throw new IllegalStateException("보유 주식이 있으면 초기화할 수 없습니다. 먼저 전량 매도해주세요.");
        }
        boolean hasPendingOrders = !orderRepository.findByUserIdAndStatusOrderByCreatedAtDesc(userId, "pending").isEmpty();
        if (hasPendingOrders) {
            throw new IllegalStateException("미체결 주문이 있으면 초기화할 수 없습니다. 먼저 모든 주문을 취소해주세요.");
        }

        LocalDate todayKst = LocalDate.now(KST);
        p.applyDailyResetTracking(todayKst);

        if (p.getResetCount() >= MAX_DAILY_RESETS) {
            throw new ResetLimitExceededException();
        }

        p.incrementResetCount();
        p.resetFinancials(INITIAL_BALANCE);
        userRepository.save(p);

        userShareRepository.deleteAll(shares);
        tradeEngine.evictUserCache(userId);
        rankCache.remove(userId);

        List<Order> orders = orderRepository.findByUserIdOrderByCreatedAtDesc(userId);
        orderRepository.deleteAll(orders);
    }

    private long cachedLeagueRank(String userId) {
        long[] entry = rankCache.get(userId);
        if (entry != null && System.currentTimeMillis() < entry[1]) {
            return entry[0];
        }
        long rank = userRepository.countUsersWithHigherTotalAssets(userId) + 1;
        rankCache.put(userId, new long[]{rank, System.currentTimeMillis() + RANK_CACHE_TTL_MS});
        return rank;
    }

    private long cachedLeagueTotal() {
        long[] entry = totalActiveCache;
        if (entry != null && System.currentTimeMillis() < entry[1]) {
            return entry[0];
        }
        long total = userRepository.countActiveUsers();
        totalActiveCache = new long[]{total, System.currentTimeMillis() + TOTAL_CACHE_TTL_MS};
        return total;
    }

    public int getRemainingResets(String userId) {
        User p = getOrCreate(userId);
        LocalDate todayKst = LocalDate.now(KST);
        if (!todayKst.equals(p.getLastResetDate())) {
            return MAX_DAILY_RESETS;
        }
        return Math.max(0, MAX_DAILY_RESETS - p.getResetCount());
    }
}
