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
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;

@Service
@RequiredArgsConstructor
@Slf4j
public class TradeEngine {

    private static final double BASE_PRICE_IMPACT = 0.0005;
    private static final double SUPPLY_BASE = 10_000.0;
    // 매도 충격 배율 상한 — unitFactor(1-impact)가 음수가 되는 것 방지
    // 상한 5배 → 주당 최대 0.25% 하락, 100주 매도 시 최대 22% 하락
    private static final double MAX_SELL_IMPACT_MULTIPLIER = 5.0;
    private static final BigDecimal MIN_PRICE = BigDecimal.ONE;
    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(10_000_000);
    private static final BigDecimal TRADE_FEE_RATE = new BigDecimal("0.01");

    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final StockRepository stockRepository;
    private final OrderRepository orderRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final PlatformTransactionManager txManager;
    private final CandleService candleService;

    // ── 읽기 캐시 (반복 SELECT 방지) ─────────────────────────────────────────────
    private final ConcurrentHashMap<String, BigDecimal> balanceCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Long>> sharesCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, BigDecimal> priceCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> supplyCache = new ConcurrentHashMap<>();

    // ── 종목별 / 유저별 독립 락 (항상 user → stock 순서로 획득) ─────────────────
    private final ConcurrentHashMap<String, ReentrantLock> userLocks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ReentrantLock> stockLocks = new ConcurrentHashMap<>();

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------

    public TradeResponse submitTrade(TradeRequest req) {
        String userId = req.getUserId();
        String channelId = req.getStreamerId();

        ReentrantLock userLock = userLocks.computeIfAbsent(userId, k -> new ReentrantLock());
        ReentrantLock stockLock = stockLocks.computeIfAbsent(channelId, k -> new ReentrantLock());

        userLock.lock();
        try {
            loadPortfolioIfAbsent(userId);
            stockLock.lock();
            try {
                loadStockIfAbsent(channelId, req.getEstimatedPrice());
                return executeAndPersist(req);
            } finally {
                stockLock.unlock();
            }
        } finally {
            userLock.unlock();
        }
    }

    // ---------------------------------------------------------------
    // 체결 → 즉시 DB 쓰기 → 캐시 갱신 → STOMP 브로드캐스트
    // (userLock + stockLock 보유 상태에서 호출)
    // ---------------------------------------------------------------

    private TradeResponse executeAndPersist(TradeRequest req) {
        String userId = req.getUserId();
        String channelId = req.getStreamerId();
        boolean isBuy = "buy".equals(req.getType());
        int qty = req.getQuantity();
        BigDecimal estimatedPrice = req.getEstimatedPrice();

        // 복리 market impact: 1주씩 n번 체결하는 것과 수학적으로 동일
        // 분할 주문 exploit 방지 — 한 번 주문이든 쪼개든 비용이 같음
        // 매수: finalPrice = P × (1+k)^n,  totalCost    = P × (1+k) × ((1+k)^n − 1) / k
        // 매도: finalPrice = P × (1-k)^n,  totalRevenue = P × (1-k) × (1 − (1-k)^n) / k
        BigDecimal currentPrice = priceCache.getOrDefault(channelId, estimatedPrice);
        long currentSupply  = supplyCache.getOrDefault(channelId, 0L);
        // 매수: 고정 충격 → 가격/발행량에 무관하게 상승폭 일정 (FOMO 증폭 방지)
        // 매도: 발행량 비례 충격 (상한 MAX_SELL_IMPACT_MULTIPLIER) → 고발행 종목 하락 억제 + 음수 방지
        double sellMultiplier = Math.min(1.0 + currentSupply / SUPPLY_BASE, MAX_SELL_IMPACT_MULTIPLIER);
        double impact = isBuy
                ? BASE_PRICE_IMPACT
                : BASE_PRICE_IMPACT * sellMultiplier;
        double unitFactor   = isBuy ? (1.0 + impact) : (1.0 - impact);
        double finalMult    = Math.pow(unitFactor, qty);
        double sumMult      = isBuy
                ? unitFactor * (finalMult - 1.0) / impact
                : unitFactor * (1.0 - finalMult) / impact;

        BigDecimal finalPrice    = currentPrice.multiply(BigDecimal.valueOf(finalMult)).max(MIN_PRICE).setScale(2, RoundingMode.HALF_UP);
        BigDecimal cost          = currentPrice.multiply(BigDecimal.valueOf(sumMult)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal executedPrice = cost.divide(BigDecimal.valueOf(qty), 2, RoundingMode.HALF_UP); // 주문서용 평균 단가

        // 잔고 / 보유량 검증
        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, Long> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        long currentQty = shares.getOrDefault(channelId, 0L);

        // 거래세: 거래금액의 1%를 소각 (인플레이션 완화)
        BigDecimal fee = cost.multiply(TRADE_FEE_RATE).setScale(2, RoundingMode.HALF_UP);

        if (isBuy && currentBalance.compareTo(cost.add(fee)) < 0) throw new IllegalStateException("잔고 부족");
        if (!isBuy && currentQty < qty) throw new IllegalStateException("보유 주식 부족");

        // 새 상태 — 매수: 거래금액 + 수수료 차감 / 매도: 거래금액에서 수수료 차감 후 지급
        BigDecimal newBalance = isBuy
                ? currentBalance.subtract(cost).subtract(fee)
                : currentBalance.add(cost).subtract(fee);
        long newQty = isBuy ? currentQty + qty : currentQty - qty;

        // DB 즉시 쓰기 (단일 트랜잭션)
        AtomicReference<Stock> savedStock = new AtomicReference<>();
        new TransactionTemplate(txManager).execute(status -> {
            // 유저 잔고
            User user = userRepository.findById(userId)
                    .orElse(User.builder().id(userId).coinBalance(INITIAL_BALANCE).build());
            user.setCoinBalance(newBalance);
            user = userRepository.save(user);

            // 보유 주식
            if (newQty == 0) {
                userShareRepository.findByUserIdAndStockChannelId(userId, channelId)
                    .ifPresent(share -> userShareRepository.delete(share));
            } else {
                // Stock이 없으면 기본값으로 생성 (안전 처리)
                Stock stock = stockRepository.findById(channelId)
                        .orElseGet(() -> stockRepository.save(Stock.builder()
                                .channelId(channelId)
                                .streamerName(channelId)
                                .totalSupply(0L)
                                .currentPrice(estimatedPrice.intValue())
                                .build()));
                UserShare share = userShareRepository.findByUserIdAndStockChannelId(userId, channelId)
                        .orElseGet(() -> UserShare.builder()
                                .user(userRepository.getReferenceById(userId))
                                .stock(stock)
                                .avgPrice(BigDecimal.ZERO)
                                .build());
                if (isBuy) {
                    BigDecimal prevAvg = share.getAvgPrice() != null ? share.getAvgPrice() : BigDecimal.ZERO;
                    BigDecimal prevTotal = prevAvg.multiply(BigDecimal.valueOf(currentQty));
                    share.setAvgPrice(prevTotal.add(cost).divide(BigDecimal.valueOf(newQty), 2, RoundingMode.HALF_UP));
                }
                share.setQuantity(newQty);
                userShareRepository.save(share);
            }

            // 종목 가격 및 순환 공급량, 일일 거래량 변경
            stockRepository.findById(channelId).ifPresent(s -> {
                s.setCurrentPrice(finalPrice.intValue());
                s.setTotalSupply(s.getTotalSupply() + (isBuy ? qty : -qty));
                s.setDailyVolume(s.getDailyVolume() + qty);
                savedStock.set(stockRepository.save(s));
            });

            // 주문 내역 기록 (orders)
            Order order = Order.builder()
                    .id(UUID.randomUUID().toString())
                    .userId(userId)
                    .streamerId(channelId)
                    .type(isBuy ? "buy" : "sell")
                    .quantity(qty)
                    .estimatedPrice(estimatedPrice)
                    .executedPrice(executedPrice)
                    .status("completed")
                    .createdAt(System.currentTimeMillis())
                    .build();
            orderRepository.save(order);

            return null;
        });

        // 캐시 갱신 (커밋 후)
        balanceCache.put(userId, newBalance);
        shares.put(channelId, newQty);
        priceCache.put(channelId, finalPrice);
        supplyCache.put(channelId, Math.max(0L, currentSupply + (isBuy ? qty : -qty)));

        // 캔들 업데이트 (STOMP /topic/candles/{channelId} 브로드캐스트 포함)
        candleService.onTrade(channelId, finalPrice, System.currentTimeMillis());

        // STOMP 브로드캐스트
        messagingTemplate.convertAndSend(
                "/topic/prices/" + channelId,
                Map.of("streamerId", channelId, "price", finalPrice)
        );
        messagingTemplate.convertAndSend(
                "/topic/trades",
                Map.of(
                        "streamerId", channelId,
                        "streamerName", savedStock.get() != null ? savedStock.get().getStreamerName() : channelId,
                        "type", isBuy ? "buy" : "sell",
                        "quantity", qty,
                        "price", executedPrice,
                        "fee", fee,
                        "timestamp", System.currentTimeMillis()
                )
        );
        if (savedStock.get() != null) {
            messagingTemplate.convertAndSend("/topic/streamers", List.of(savedStock.get()));
        }

        return new TradeResponse("executed", executedPrice, newBalance, fee);
    }

    // ---------------------------------------------------------------
    // 캐시 제거 (포트폴리오 초기화 후 호출)
    // ---------------------------------------------------------------

    public void evictUserCache(String userId) {
        balanceCache.remove(userId);
        sharesCache.remove(userId);
    }

    public void evictSupplyCache(String channelId) {
        supplyCache.remove(channelId);
    }

    // ---------------------------------------------------------------
    // 캐시 로드 (락 보호 하에 호출 → 동시 접근 없음)
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

    private void loadStockIfAbsent(String channelId, BigDecimal fallback) {
        if (priceCache.containsKey(channelId)) return;
        stockRepository.findById(channelId).ifPresentOrElse(
            s -> {
                priceCache.put(channelId, BigDecimal.valueOf(s.getCurrentPrice()));
                supplyCache.put(channelId, s.getTotalSupply());
            },
            () -> {
                priceCache.put(channelId, fallback);
                supplyCache.put(channelId, 0L);
            }
        );
    }
}
