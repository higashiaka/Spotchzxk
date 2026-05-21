package com.spotchzxk.service;

import com.spotchzxk.dto.TradeRequest;
import com.spotchzxk.dto.TradeResponse;
import com.spotchzxk.entity.*;
import com.spotchzxk.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

@Service
@RequiredArgsConstructor
@Slf4j
public class TradeEngine {

    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(10_000_000);
    // dev engine.ts 동일: 1주당 0.05% 가격 충격
    private static final double PRICE_IMPACT_PER_SHARE = 0.0005;

    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final StockRepository stockRepository;
    private final OrderRepository orderRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final PlatformTransactionManager txManager;
    private final CandleService candleService;

    // ── 읽기 캐시 ──────────────────────────────────────────────────────────────
    private final ConcurrentHashMap<String, BigDecimal> balanceCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Long>> sharesCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, BigDecimal> priceCache = new ConcurrentHashMap<>();

    // ── 종목별 / 유저별 독립 락 ──────────────────────────────────────────────────
    private final ConcurrentHashMap<String, ReentrantLock> userLocks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ReentrantLock> stockLocks = new ConcurrentHashMap<>();

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------

    public TradeResponse submitTrade(TradeRequest req) {
        String userId = req.getUserId();
        String channelId = req.getStreamerId();
        boolean isBuy = "buy".equals(req.getType());
        int qty = req.getQuantity();

        ReentrantLock userLock = userLocks.computeIfAbsent(userId, k -> new ReentrantLock());
        ReentrantLock stockLock = stockLocks.computeIfAbsent(channelId, k -> new ReentrantLock());

        userLock.lock();
        try {
            loadPortfolioIfAbsent(userId);
            stockLock.lock();
            try {
                return executeMarketOrder(userId, channelId, isBuy, qty, req.getEstimatedPrice());
            } finally {
                stockLock.unlock();
            }
        } finally {
            userLock.unlock();
        }
    }

    public void evictUserCache(String userId) {
        balanceCache.remove(userId);
        sharesCache.remove(userId);
    }

    // ---------------------------------------------------------------
    // 시장가 체결 — dev engine.ts의 가격충격 공식 적용
    // 매수: price *= (1 + qty * 0.0005)  → 올라간 가격에 즉시 체결
    // 매도: price *= (1 - qty * 0.0005)  → 내려간 가격에 즉시 체결
    // ---------------------------------------------------------------

    private TradeResponse executeMarketOrder(String userId, String channelId,
                                             boolean isBuy, int qty,
                                             BigDecimal fallbackPrice) {
        BigDecimal currentPrice = priceCache.computeIfAbsent(channelId, k ->
                stockRepository.findById(k)
                        .map(s -> BigDecimal.valueOf(s.getCurrentPrice()))
                        .orElse(fallbackPrice));

        double netDelta = isBuy ? qty : -qty;
        double multiplier = 1.0 + (netDelta * PRICE_IMPACT_PER_SHARE);
        BigDecimal executedPrice = BigDecimal.valueOf(
                Math.max(1.0, currentPrice.doubleValue() * multiplier))
                .setScale(0, RoundingMode.HALF_UP);

        BigDecimal cost = executedPrice.multiply(BigDecimal.valueOf(qty));

        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, Long> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        long heldQty = shares.getOrDefault(channelId, 0L);

        // 사전 검증
        if (isBuy) {
            if (currentBalance.compareTo(cost) < 0)
                throw new IllegalStateException("잔액이 부족합니다.");
            Stock s = stockRepository.findById(channelId)
                    .orElseThrow(() -> new IllegalStateException("종목을 찾을 수 없습니다."));
            if (s.getTotalSupply() > 0 && s.getIssuedShares() + qty > s.getTotalSupply())
                throw new IllegalStateException("발행량 한도를 초과했습니다.");
        } else {
            if (heldQty < qty)
                throw new IllegalStateException("보유 주식이 부족합니다.");
        }

        // DB 트랜잭션
        BigDecimal finalExecutedPrice = executedPrice;
        new TransactionTemplate(txManager).execute(status -> {
            Stock stock = stockRepository.findById(channelId).orElseThrow();
            stock.setCurrentPrice(finalExecutedPrice.intValue());
            stock.setDailyVolume(stock.getDailyVolume() + qty);
            if (isBuy) {
                stock.setIssuedShares(stock.getIssuedShares() + qty);
            } else {
                stock.setIssuedShares(Math.max(0, stock.getIssuedShares() - qty));
            }
            stockRepository.save(stock);

            User user = userRepository.findById(userId)
                    .orElse(User.builder().id(userId).coinBalance(INITIAL_BALANCE).build());
            if (isBuy) {
                user.setCoinBalance(user.getCoinBalance().subtract(cost));
            } else {
                user.setCoinBalance(user.getCoinBalance().add(cost));
            }
            userRepository.save(user);

            // 보유 주식 갱신
            UserShare share = userShareRepository.findByUserIdAndStockChannelId(userId, channelId)
                    .orElseGet(() -> UserShare.builder().user(user).stock(stock)
                            .quantity(0L).avgPrice(BigDecimal.ZERO).build());
            if (isBuy) {
                long prevQty = share.getQuantity();
                long newQty = prevQty + qty;
                BigDecimal prevAvg = share.getAvgPrice() != null ? share.getAvgPrice() : BigDecimal.ZERO;
                BigDecimal newAvg = prevAvg.multiply(BigDecimal.valueOf(prevQty))
                        .add(cost)
                        .divide(BigDecimal.valueOf(newQty), 2, RoundingMode.HALF_UP);
                share.setAvgPrice(newAvg);
                share.setQuantity(newQty);
                userShareRepository.save(share);
            } else {
                long newQty = share.getQuantity() - qty;
                if (newQty <= 0) {
                    userShareRepository.delete(share);
                } else {
                    share.setQuantity(newQty);
                    userShareRepository.save(share);
                }
            }

            // 주문 이력 기록
            orderRepository.save(Order.builder()
                    .id(UUID.randomUUID().toString())
                    .userId(userId)
                    .streamerId(channelId)
                    .type(isBuy ? "buy" : "sell")
                    .quantity(qty)
                    .estimatedPrice(fallbackPrice)
                    .executedPrice(finalExecutedPrice)
                    .orderMode("market")
                    .status("completed")
                    .createdAt(System.currentTimeMillis())
                    .build());

            return null;
        });

        // 캐시 갱신
        priceCache.put(channelId, executedPrice);
        BigDecimal newBalance = isBuy
                ? currentBalance.subtract(cost)
                : currentBalance.add(cost);
        balanceCache.put(userId, newBalance);
        shares.put(channelId, isBuy ? heldQty + qty : heldQty - qty);

        // 브로드캐스트
        candleService.onTrade(channelId, executedPrice, System.currentTimeMillis());
        messagingTemplate.convertAndSend("/topic/prices/" + channelId,
                Map.of("streamerId", channelId, "price", executedPrice));
        messagingTemplate.convertAndSend("/topic/trades", Map.of(
                "streamerId", channelId,
                "streamerName", stockRepository.findById(channelId)
                        .map(Stock::getStreamerName).orElse(channelId),
                "type", isBuy ? "buy" : "sell",
                "quantity", qty,
                "price", executedPrice,
                "timestamp", System.currentTimeMillis()
        ));

        return new TradeResponse("executed", executedPrice, newBalance,
                BigDecimal.ZERO, UUID.randomUUID().toString(), "market");
    }

    // ---------------------------------------------------------------
    // 캐시 로딩
    // ---------------------------------------------------------------

    private void loadPortfolioIfAbsent(String userId) {
        if (balanceCache.containsKey(userId)) return;
        User user = userRepository.findById(userId)
                .orElse(User.builder().id(userId).coinBalance(INITIAL_BALANCE).build());
        balanceCache.put(userId, user.getCoinBalance());
        Map<String, Long> shares = new ConcurrentHashMap<>();
        userShareRepository.findByUserId(userId)
                .forEach(s -> shares.put(s.getStock().getChannelId(), s.getQuantity()));
        sharesCache.put(userId, shares);
    }
}
