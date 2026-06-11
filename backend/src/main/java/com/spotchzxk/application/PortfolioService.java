package com.spotchzxk.application;

import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.entity.UserShare;
import com.spotchzxk.shared.exception.ResetLimitExceededException;
import com.spotchzxk.domain.order.repository.OrderRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
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

    // Issue #4: 珥덇린 ?붿븸 10,000,000??(湲곗〈 1,000,000? ?뺤꽦湲?醫낅ぉ異붽?沅?援щℓ 遺덇? ?섏?)
    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(10_000_000);
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
        List<UserShare> userShares = userShareRepository.findByUserIdWithPositiveQuantityAndStock(userId);
        Map<String, Long> shares = userShares.stream()
                .collect(Collectors.toMap(
                        s -> s.getStock().getChannelId(),
                        s -> s.getQuantity()
                ));
        Map<String, BigDecimal> avgPrices = userShares.stream()
                .collect(Collectors.toMap(
                        s -> s.getStock().getChannelId(),
                        s -> s.getAvgPrice() != null ? s.getAvgPrice() : BigDecimal.ZERO
                ));
        Map<String, Object> response = new HashMap<>();
        response.put("balance", p.getCoinBalance());
        response.put("shares", shares);
        response.put("avgPrices", avgPrices);
        response.put("dividendTotal", p.getDividendTotal() != null ? p.getDividendTotal() : BigDecimal.ZERO);
        response.put("donationTotal", p.getDonationTotal() != null ? p.getDonationTotal() : BigDecimal.ZERO);
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
            throw new IllegalStateException("蹂댁쑀 二쇱떇???덉쑝硫?珥덇린?뷀븷 ???놁뒿?덈떎. 癒쇱? ?꾨웾 留ㅻ룄?댁＜?몄슂.");
        }
        boolean hasPendingOrders = !orderRepository.findByUserIdAndStatusOrderByCreatedAtDesc(userId, "pending").isEmpty();
        if (hasPendingOrders) {
            throw new IllegalStateException("誘몄껜寃?二쇰Ц???덉쑝硫?珥덇린?뷀븷 ???놁뒿?덈떎. 癒쇱? 紐⑤뱺 二쇰Ц??痍⑥냼?댁＜?몄슂.");
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
        evictAfterCommit(userId);
        // Issue #24: ?꾨즺??二쇰Ц 湲곕줉? ??젣?섏? ?딆쓬 ??嫄곕옒 ?덉뒪?좊━ 蹂댁〈
    }

    private void evictAfterCommit(String userId) {
        Runnable evict = () -> {
            tradeEngine.evictUserCache(userId);
            rankCache.remove(userId);
        };
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            evict.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                evict.run();
            }
        });
    }

    private long cachedLeagueRank(String userId) {
        long now = System.currentTimeMillis();
        long[] entry = rankCache.compute(userId, (key, current) -> {
            if (current != null && now < current[1]) {
                return current;
            }
            long rank = userRepository.countUsersWithHigherTotalAssets(key) + 1;
            return new long[]{rank, now + RANK_CACHE_TTL_MS};
        });
        return entry[0];
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


