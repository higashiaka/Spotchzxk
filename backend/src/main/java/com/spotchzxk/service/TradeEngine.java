package com.spotchzxk.service;

import com.spotchzxk.dto.TradeRequest;
import com.spotchzxk.dto.TradeResponse;
import com.spotchzxk.entity.Order;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.entity.User;
import com.spotchzxk.entity.UserShare;
import com.spotchzxk.repository.OrderRepository;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserRepository;
import com.spotchzxk.repository.UserShareRepository;
import com.spotchzxk.policy.AntiWhalePolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

@Service
@RequiredArgsConstructor
@Slf4j
public class TradeEngine {

    // Issue #4: 초기 잔액 10,000,000원으로 수정 (기존 1,000,000은 게임 경제 파괴 수준)
    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(10_000_000);

    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final StockRepository stockRepository;
    private final OrderRepository orderRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final PlatformTransactionManager txManager;
    private final CandleService candleService;

    private final ConcurrentHashMap<String, BigDecimal> balanceCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Long>> sharesCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, BigDecimal> priceCache = new ConcurrentHashMap<>();
    // {coinReserve, shareReserve}
    private final ConcurrentHashMap<String, long[]> ammPoolCache = new ConcurrentHashMap<>();

    private final ConcurrentHashMap<String, ReentrantLock> userLocks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ReentrantLock> stockLocks = new ConcurrentHashMap<>();

    public TradeResponse submitTrade(TradeRequest req) {
        String userId = req.getUserId();
        String channelId = req.getStreamerId();
        boolean isBuy = "buy".equals(req.getType());
        long qty = req.getQuantity();

        ReentrantLock userLock = userLocks.computeIfAbsent(userId, k -> new ReentrantLock());
        ReentrantLock stockLock = stockLocks.computeIfAbsent(channelId, k -> new ReentrantLock());

        userLock.lock();
        try {
            loadPortfolioIfAbsent(userId);
            stockLock.lock();
            try {
                if ("limit".equals(req.getOrderMode())) {
                    return submitLimitOrder(userId, channelId, isBuy, qty, req.getEstimatedPrice(), req.getLimitPrice());
                }
                // Issue #5: 슬리피지 보호 파라미터를 executeMarketOrder에 전달
                return executeMarketOrder(userId, channelId, isBuy, qty, req.getEstimatedPrice(), true,
                        req.getMaxCoinIn(), req.getMinCoinOut());
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

    public void runWithUserLock(String userId, Runnable task) {
        ReentrantLock userLock = userLocks.computeIfAbsent(userId, k -> new ReentrantLock());
        userLock.lock();
        try {
            task.run();
        } finally {
            userLock.unlock();
        }
    }

    public void evictStockCache(String channelId) {
        priceCache.remove(channelId);
        ammPoolCache.remove(channelId);
    }

    public void evictAllPortfolioCaches() {
        balanceCache.clear();
        sharesCache.clear();
    }

    public TradeResponse cancelLimitOrder(String userId, String orderId) {
        BigDecimal[] newBalance = new BigDecimal[1];
        runWithUserLock(userId, () -> {
            newBalance[0] = cancelLimitOrderLocked(userId, orderId);
            evictUserCache(userId); // 락 안에서 무효화 — 커밋 직후, 다른 스레드가 구버전 캐시로 재진입하기 전
        });

        messagingTemplate.convertAndSend("/topic/orders/" + userId,
                Map.of("orderId", orderId, "status", "cancelled"));
        return new TradeResponse("cancelled", BigDecimal.ZERO, newBalance[0], BigDecimal.ZERO, orderId, "limit");
    }

    private BigDecimal cancelLimitOrderLocked(String userId, String orderId) {
        return new TransactionTemplate(txManager).execute(status -> {
            Order order = orderRepository.findByIdForUpdate(orderId)
                    .orElseThrow(() -> new IllegalStateException("Order not found."));
            if (!userId.equals(order.getUserId())) {
                throw new IllegalStateException("Order not found.");
            }
            if (!"pending".equals(order.getStatus())) {
                throw new IllegalStateException("Order is not pending.");
            }

            BigDecimal refund = BigDecimal.ZERO;
            if ("buy".equals(order.getType())) {
                refund = order.getLimitPrice().multiply(BigDecimal.valueOf(order.getQuantity()));
            }

            order.cancel();
            orderRepository.save(order);
            addToUserBalance(userId, refund);
            return userRepository.findById(userId)
                    .map(User::getCoinBalance)
                    .orElseThrow(() -> new IllegalStateException("User not found."));
        });
    }

    // Issue #5: maxCoinIn/minCoinOut 파라미터 추가로 슬리피지 보호 구현
    // Issue #1: orderId를 미리 생성해 persistTrade와 응답에서 동일 ID 사용 (기존에는 2개의 UUID가 생성됨)
    private TradeResponse executeMarketOrder(String userId, String channelId,
                                             boolean isBuy, long qty,
                                             BigDecimal fallbackPrice,
                                             boolean processPendingAfterExecution,
                                             Long maxCoinIn, Long minCoinOut) {
        AmmCalculator.AmmResult amm = calculateAmmTrade(channelId, isBuy, qty);
        long userNetAmount = amm.userNetAmount();

        // 슬리피지 보호 검사
        if (isBuy && maxCoinIn != null && userNetAmount > maxCoinIn) {
            throw new IllegalStateException("슬리피지 초과: 예상 비용 " + userNetAmount + " > maxCoinIn " + maxCoinIn);
        }
        if (!isBuy && minCoinOut != null && userNetAmount < minCoinOut) {
            throw new IllegalStateException("슬리피지 초과: 예상 수령 " + userNetAmount + " < minCoinOut " + minCoinOut);
        }

        BigDecimal userNet = BigDecimal.valueOf(userNetAmount);
        long executedAt = System.currentTimeMillis();

        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, Long> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        long heldQty = shares.getOrDefault(channelId, 0L);

        validateTrade(userId, channelId, isBuy, qty, isBuy ? userNet : BigDecimal.ZERO, currentBalance, heldQty);

        // 동일한 orderId를 DB 저장과 응답에 사용
        String orderId = UUID.randomUUID().toString();
        String streamerName = persistTrade(userId, channelId, amm, isBuy, qty, fallbackPrice, executedAt, orderId, "market", null);
        BigDecimal newBalance = updateCaches(userId, channelId, isBuy, qty, amm, currentBalance, shares, heldQty);
        broadcastTrade(channelId, streamerName, isBuy, qty, amm.newPrice(), executedAt, userNet);
        if (processPendingAfterExecution) {
            processPendingLimitOrders(channelId);
        }

        return new TradeResponse("executed", amm.avgPrice(), newBalance,
                BigDecimal.ZERO, orderId, "market");
    }

    private TradeResponse submitLimitOrder(String userId, String channelId, boolean isBuy, long qty,
                                           BigDecimal fallbackPrice, BigDecimal limitPrice) {
        if (limitPrice == null || limitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalStateException("Limit price is required.");
        }

        BigDecimal currentPrice = loadPrice(channelId, fallbackPrice);
        if (isLimitMarketable(currentPrice, isBuy, limitPrice)) {
            return executeImmediateLimitOrder(userId, channelId, isBuy, qty, fallbackPrice, limitPrice);
        }
        return createPendingLimitOrder(userId, channelId, isBuy, qty, fallbackPrice, limitPrice);
    }

    private boolean isLimitMarketable(BigDecimal currentPrice, boolean isBuy, BigDecimal limitPrice) {
        return isBuy
                ? currentPrice.compareTo(limitPrice) <= 0
                : currentPrice.compareTo(limitPrice) >= 0;
    }

    // 지정가 체결 가능 여부 확인 + AMM 계산. 슬리피지가 예약금 초과하면 null 반환.
    private AmmCalculator.AmmResult calcAmmTradeForLimit(String channelId, boolean isBuy, long qty,
                                                          BigDecimal limitPrice) {
        AmmCalculator.AmmResult amm = calculateAmmTrade(channelId, isBuy, qty);
        BigDecimal reservation = limitPrice.multiply(BigDecimal.valueOf(qty));
        if (isBuy && BigDecimal.valueOf(amm.userNetAmount()).compareTo(reservation) > 0) {
            return null; // 슬리피지로 예약금 초과
        }
        if (!isBuy && BigDecimal.valueOf(amm.userNetAmount()).compareTo(reservation) < 0) {
            return null; // 슬리피지로 최소 수령액 미달
        }
        return amm;
    }

    private TradeResponse executeImmediateLimitOrder(String userId, String channelId, boolean isBuy, long qty,
                                                     BigDecimal fallbackPrice, BigDecimal limitPrice) {
        AmmCalculator.AmmResult amm = calcAmmTradeForLimit(channelId, isBuy, qty, limitPrice);
        if (amm == null) throw new IllegalStateException("Slippage exceeds limit price.");
        BigDecimal userNet = BigDecimal.valueOf(amm.userNetAmount());
        long executedAt = System.currentTimeMillis();

        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, Long> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        long heldQty = shares.getOrDefault(channelId, 0L);

        validateTrade(userId, channelId, isBuy, qty, isBuy ? userNet : BigDecimal.ZERO, currentBalance, heldQty);
        String orderId = UUID.randomUUID().toString();
        String streamerName = persistTrade(userId, channelId, amm, isBuy, qty, fallbackPrice,
                executedAt, orderId, "limit", limitPrice);
        BigDecimal newBalance = updateCaches(userId, channelId, isBuy, qty, amm, currentBalance, shares, heldQty);
        broadcastTrade(channelId, streamerName, isBuy, qty, amm.newPrice(), executedAt, userNet);
        processPendingLimitOrders(channelId);

        return new TradeResponse("executed", amm.avgPrice(), newBalance, BigDecimal.ZERO, orderId, "limit");
    }

    private TradeResponse createPendingLimitOrder(String userId, String channelId, boolean isBuy, long qty,
                                                  BigDecimal fallbackPrice, BigDecimal limitPrice) {
        BigDecimal reserveAmount = limitPrice.multiply(BigDecimal.valueOf(qty));
        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, Long> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        long heldQty = shares.getOrDefault(channelId, 0L);

        validateLimitOrder(channelId, userId, isBuy, qty, reserveAmount, currentBalance, heldQty);
        String orderId = UUID.randomUUID().toString();
        BigDecimal newBalance = reservePendingLimitOrder(userId, channelId, isBuy, qty, fallbackPrice, limitPrice,
                reserveAmount, orderId);

        if (isBuy) {
            balanceCache.put(userId, newBalance);
        }

        return new TradeResponse("pending", BigDecimal.ZERO, newBalance, BigDecimal.ZERO, orderId, "limit");
    }

    private BigDecimal loadPrice(String channelId, BigDecimal fallbackPrice) {
        long[] pool = loadAmmPool(channelId);
        return AmmCalculator.price(pool[0], pool[1]);
    }

    private long[] loadAmmPool(String channelId) {
        return ammPoolCache.computeIfAbsent(channelId, k ->
                stockRepository.findById(k)
                        .map(s -> new long[]{s.getCoinReserve(), s.getShareReserve()})
                        .orElseThrow(() -> new IllegalStateException("Stock not found: " + k)));
    }

    AmmCalculator.AmmResult calculateAmmTrade(String channelId, boolean isBuy, long qty) {
        long[] pool = loadAmmPool(channelId);
        return isBuy
                ? AmmCalculator.calcBuy(pool[0], pool[1], qty)
                : AmmCalculator.calcSell(pool[0], pool[1], qty);
    }

    private void validateTrade(String userId, String channelId, boolean isBuy, long qty, BigDecimal cost,
                               BigDecimal currentBalance, long heldQty) {
        if (!isBuy) {
            long pendingSellQty = orderRepository.sumPendingSellQuantity(userId, channelId);
            if (heldQty - pendingSellQty < qty) {
                throw new IllegalStateException("Insufficient shares.");
            }
            return;
        }

        if (currentBalance.compareTo(cost) < 0) {
            throw new IllegalStateException("Insufficient balance.");
        }

        Stock stock = stockRepository.findById(channelId)
                .orElseThrow(() -> new IllegalStateException("Stock not found."));
        boolean isNewListing = stock.getListedAt() != null
                && ChronoUnit.HOURS.between(stock.getListedAt(), LocalDateTime.now()) < AntiWhalePolicy.NEW_LISTING_HOURS;
        if (isNewListing) {
            long pendingBuyQty = orderRepository.sumPendingBuyQuantity(userId, channelId);
            if (heldQty + pendingBuyQty + qty > AntiWhalePolicy.NEW_LISTING_CAP) {
                throw new IllegalStateException("신규 상장 초기 최대 200개까지 매수 가능합니다.");
            }
        }

        if (stock.getTotalSupply() > 0 && stock.getIssuedShares() + qty > stock.getTotalSupply()) {
            throw new IllegalStateException("Issued share limit exceeded.");
        }
    }

    private void validateLimitOrder(String channelId, String userId, boolean isBuy, long qty, BigDecimal reserveAmount,
                                    BigDecimal currentBalance, long heldQty) {
        if (isBuy) {
            validateTrade(userId, channelId, true, qty, reserveAmount, currentBalance, heldQty);
            Stock stock = stockRepository.findById(channelId)
                    .orElseThrow(() -> new IllegalStateException("Stock not found."));
            long pendingBuyQty = orderRepository.sumPendingBuyQuantityByStreamerId(channelId);
            if (stock.getTotalSupply() > 0 && stock.getIssuedShares() + pendingBuyQty + qty > stock.getTotalSupply()) {
                throw new IllegalStateException("Issued share limit exceeded.");
            }
            return;
        }

        long pendingSellQty = orderRepository.sumPendingSellQuantity(userId, channelId);
        if (heldQty - pendingSellQty < qty) {
            throw new IllegalStateException("Insufficient shares.");
        }
    }

    private String persistTrade(String userId, String channelId, AmmCalculator.AmmResult amm,
                                boolean isBuy, long qty, BigDecimal fallbackPrice, long executedAt,
                                String orderId, String orderMode, BigDecimal limitPrice) {
        BigDecimal userNet = BigDecimal.valueOf(amm.userNetAmount());
        return new TransactionTemplate(txManager).execute(status -> {
            Stock stock = stockRepository.findById(channelId).orElseThrow();
            User user = getOrCreateUser(userId);

            updateStock(stock, isBuy, qty, amm, userNet);
            BigDecimal realizedProfit = updateUserShareAndCalculateProfit(user, stock, channelId, isBuy, qty, userNet);
            addToUserBalance(userId, isBuy ? userNet.negate() : userNet);
            if (!isBuy) {
                addToUserRealizedProfit(userId, realizedProfit);
            }
            saveOrder(userId, channelId, isBuy, qty, fallbackPrice, amm.avgPrice(), executedAt,
                    orderId, orderMode, limitPrice, "completed");
            return stock.getStreamerName();
        });
    }

    private User getOrCreateUser(String userId) {
        return userRepository.findById(userId)
                .orElseGet(() -> userRepository.save(User.builder().id(userId).coinBalance(INITIAL_BALANCE).build()));
    }

    private void updateStock(Stock stock, boolean isBuy, long qty, AmmCalculator.AmmResult amm, BigDecimal userNet) {
        stock.applyAmmTrade(amm.newPool()[0], amm.newPool()[1], amm.feePoolAmount());
        stock.applyTrade(amm.newPrice().longValue(), isBuy, qty, userNet.longValue());
        stockRepository.save(stock);
    }

    private BigDecimal updateUserShareAndCalculateProfit(User user, Stock stock, String channelId, boolean isBuy,
                                                         long qty, BigDecimal cost) {
        UserShare share = userShareRepository.findByUserIdAndStockChannelId(user.getId(), channelId)
                .orElseGet(() -> UserShare.builder()
                        .user(user)
                        .stock(stock)
                        .quantity(0L)
                        .avgPrice(BigDecimal.ZERO)
                        .build());

        if (isBuy) {
            updateBoughtShare(share, qty, cost);
            return BigDecimal.ZERO;
        } else {
            BigDecimal profit = calculateRealizedProfit(share, qty, cost);
            updateSoldShare(share, qty);
            return profit;
        }
    }

    private void updateBoughtShare(UserShare share, long qty, BigDecimal cost) {
        long prevQty = share.getQuantity();
        long newQty = prevQty + qty;
        BigDecimal prevAvg = share.getAvgPrice() != null ? share.getAvgPrice() : BigDecimal.ZERO;
        BigDecimal newAvg = prevAvg.multiply(BigDecimal.valueOf(prevQty))
                .add(cost)
                .divide(BigDecimal.valueOf(newQty), 2, RoundingMode.HALF_UP);
        share.updateOnBuy(newQty, newAvg);
        userShareRepository.save(share);
    }

    private void updateSoldShare(UserShare share, long qty) {
        long newQty = share.getQuantity() - qty;
        if (newQty <= 0) {
            userShareRepository.delete(share);
            return;
        }
        share.updateOnSell(newQty);
        userShareRepository.save(share);
    }

    private BigDecimal calculateRealizedProfit(UserShare share, long qty, BigDecimal proceeds) {
        BigDecimal avgBuyPrice = share.getAvgPrice() != null ? share.getAvgPrice() : BigDecimal.ZERO;
        BigDecimal costBasis = avgBuyPrice.multiply(BigDecimal.valueOf(qty));
        return proceeds.subtract(costBasis).setScale(2, RoundingMode.HALF_UP);
    }

    private void addToUserBalance(String userId, BigDecimal delta) {
        if (delta.compareTo(BigDecimal.ZERO) == 0) {
            return;
        }
        if (userRepository.addToBalance(userId, delta) != 1) {
            throw new IllegalStateException("User not found.");
        }
    }

    private void addToUserRealizedProfit(String userId, BigDecimal delta) {
        if (delta.compareTo(BigDecimal.ZERO) == 0) {
            return;
        }
        if (userRepository.addToRealizedProfit(userId, delta) != 1) {
            throw new IllegalStateException("User not found.");
        }
    }

    private void saveOrder(String userId, String channelId, boolean isBuy, long qty,
                           BigDecimal fallbackPrice, BigDecimal executedPrice, long executedAt,
                           String orderId, String orderMode, BigDecimal limitPrice, String orderStatus) {
        orderRepository.save(Order.builder()
                .id(orderId)
                .userId(userId)
                .streamerId(channelId)
                .type(isBuy ? "buy" : "sell")
                .quantity(qty)
                .estimatedPrice(fallbackPrice)
                .executedPrice(executedPrice)
                .orderMode(orderMode)
                .limitPrice(limitPrice)
                .status(orderStatus)
                .createdAt(executedAt)
                .executedAt("completed".equals(orderStatus) ? executedAt : null)
                .build());
    }

    private BigDecimal reservePendingLimitOrder(String userId, String channelId, boolean isBuy, long qty,
                                                BigDecimal fallbackPrice, BigDecimal limitPrice,
                                                BigDecimal reserveAmount, String orderId) {
        return new TransactionTemplate(txManager).execute(status -> {
            getOrCreateUser(userId);
            BigDecimal newBalance = userRepository.findById(userId)
                    .map(User::getCoinBalance)
                    .orElseThrow(() -> new IllegalStateException("User not found."));
            if (isBuy) {
                newBalance = newBalance.subtract(reserveAmount);
                if (newBalance.compareTo(BigDecimal.ZERO) < 0) {
                    throw new IllegalStateException("Insufficient balance.");
                }
                addToUserBalance(userId, reserveAmount.negate());
            }
            orderRepository.save(Order.builder()
                    .id(orderId)
                    .userId(userId)
                    .streamerId(channelId)
                    .type(isBuy ? "buy" : "sell")
                    .quantity(qty)
                    .estimatedPrice(fallbackPrice)
                    .executedPrice(null)
                    .orderMode("limit")
                    .limitPrice(limitPrice)
                    .status("pending")
                    .createdAt(System.currentTimeMillis())
                    .build());
            return newBalance;
        });
    }

    // Issue #11: 각 주문 체결 사이에 최신 AMM 가격 로드 (캐시는 이전 체결 직후 갱신됨)
    private void processPendingLimitOrders(String channelId) {
        for (Order order : orderRepository.findByStreamerIdAndStatusOrderByCreatedAtAsc(channelId, "pending")) {
            BigDecimal currentPrice = loadPrice(channelId, BigDecimal.valueOf(1));
            boolean isBuy = "buy".equals(order.getType());
            BigDecimal limitPrice = order.getLimitPrice();
            if (limitPrice == null || !isLimitMarketable(currentPrice, isBuy, limitPrice)) {
                continue;
            }
            executePendingLimitOrder(order);
        }
    }

    // Issue #2: AMM 계산을 트랜잭션 내부에서 DB-fresh 풀 기준으로 수행 (기존 캐시 기반 외부 계산은 race condition 유발)
    private void executePendingLimitOrder(Order order) {
        boolean isBuy = "buy".equals(order.getType());
        long executedAt = System.currentTimeMillis();

        AmmCalculator.AmmResult[] resultHolder = new AmmCalculator.AmmResult[1];
        new TransactionTemplate(txManager).executeWithoutResult(status -> {
            Order freshOrder = orderRepository.findByIdForUpdate(order.getId()).orElse(null);
            if (freshOrder == null || !"pending".equals(freshOrder.getStatus())) return;

            boolean freshIsBuy = "buy".equals(freshOrder.getType());
            Stock stock = stockRepository.findById(freshOrder.getStreamerId()).orElseThrow();
            User user = userRepository.findById(freshOrder.getUserId())
                    .orElseThrow(() -> new IllegalStateException("User not found."));

            // DB-fresh 풀로 AMM 재계산 (캐시와 DB 사이 다른 스레드 거래로 풀이 달라질 수 있음)
            AmmCalculator.AmmResult amm = freshIsBuy
                    ? AmmCalculator.calcBuy(stock.getCoinReserve(), stock.getShareReserve(), freshOrder.getQuantity())
                    : AmmCalculator.calcSell(stock.getCoinReserve(), stock.getShareReserve(), freshOrder.getQuantity());

            BigDecimal userNet = BigDecimal.valueOf(amm.userNetAmount());
            BigDecimal reservation = freshOrder.getLimitPrice().multiply(BigDecimal.valueOf(freshOrder.getQuantity()));

            // 재계산 후 슬리피지 재확인
            if (freshIsBuy && userNet.compareTo(reservation) > 0) return;
            if (!freshIsBuy && userNet.compareTo(reservation) < 0) return;

            if (freshIsBuy) {
                if (stock.getTotalSupply() > 0
                        && stock.getIssuedShares() + freshOrder.getQuantity() > stock.getTotalSupply()) {
                    BigDecimal refund = freshOrder.getLimitPrice()
                            .multiply(BigDecimal.valueOf(freshOrder.getQuantity()));
                    freshOrder.cancel();
                    orderRepository.save(freshOrder);
                    addToUserBalance(freshOrder.getUserId(), refund);
                    return;
                }
                BigDecimal reserved = freshOrder.getLimitPrice().multiply(BigDecimal.valueOf(freshOrder.getQuantity()));
                BigDecimal refund = reserved.subtract(userNet).max(BigDecimal.ZERO);
                updateUserShareAndCalculateProfit(user, stock, freshOrder.getStreamerId(), true,
                        freshOrder.getQuantity(), userNet);
                if (refund.compareTo(BigDecimal.ZERO) > 0) {
                    addToUserBalance(user.getId(), refund);
                }
            } else {
                UserShare share = userShareRepository.findByUserIdAndStockChannelId(
                        user.getId(), freshOrder.getStreamerId()).orElse(null);
                if (share == null || share.getQuantity() < freshOrder.getQuantity()) {
                    freshOrder.cancel();
                    orderRepository.save(freshOrder);
                    return;
                }
                BigDecimal profit = calculateRealizedProfit(share, freshOrder.getQuantity(), userNet);
                updateSoldShare(share, freshOrder.getQuantity());
                addToUserBalance(user.getId(), userNet);
                addToUserRealizedProfit(user.getId(), profit);
            }

            updateStock(stock, freshIsBuy, freshOrder.getQuantity(), amm, userNet);
            freshOrder.complete(amm.avgPrice(), executedAt);
            orderRepository.save(freshOrder);
            resultHolder[0] = amm;
        });

        if (resultHolder[0] == null) {
            evictUserCache(order.getUserId());
            return;
        }

        AmmCalculator.AmmResult amm = resultHolder[0];
        ammPoolCache.put(order.getStreamerId(), amm.newPool());
        priceCache.put(order.getStreamerId(), amm.newPrice());
        evictUserCache(order.getUserId());
        String streamerName = stockRepository.findById(order.getStreamerId())
                .map(Stock::getStreamerName)
                .orElse(order.getStreamerId());
        broadcastTrade(order.getStreamerId(), streamerName, isBuy, order.getQuantity(), amm.newPrice(), executedAt,
                BigDecimal.valueOf(amm.userNetAmount()));
        messagingTemplate.convertAndSend("/topic/orders/" + order.getUserId(),
                Map.of("orderId", order.getId(), "status", "completed"));
    }

    private BigDecimal updateCaches(String userId, String channelId, boolean isBuy, long qty,
                                    AmmCalculator.AmmResult amm, BigDecimal currentBalance,
                                    Map<String, Long> shares, long heldQty) {
        ammPoolCache.put(channelId, amm.newPool());
        priceCache.put(channelId, amm.newPrice());

        BigDecimal userNet = BigDecimal.valueOf(amm.userNetAmount());
        BigDecimal newBalance = isBuy
                ? currentBalance.subtract(userNet)
                : currentBalance.add(userNet);
        balanceCache.put(userId, newBalance);

        shares.put(channelId, isBuy ? heldQty + qty : heldQty - qty);
        return newBalance;
    }

    // Issue #18: candleService.onTrade를 비동기 호출해 stockLock 보유 상태에서의 모니터 락 중첩 제거
    private void broadcastTrade(String channelId, String streamerName, boolean isBuy, long qty,
                                BigDecimal executedPrice, long executedAt, BigDecimal cost) {
        CompletableFuture.runAsync(() -> candleService.onTrade(channelId, executedPrice, executedAt));
        messagingTemplate.convertAndSend("/topic/prices/" + channelId,
                Map.of("streamerId", channelId, "price", executedPrice));
        messagingTemplate.convertAndSend("/topic/trades", Map.of(
                "streamerId", channelId,
                "streamerName", streamerName != null ? streamerName : channelId,
                "type", isBuy ? "buy" : "sell",
                "quantity", qty,
                "price", executedPrice,
                "tradingValue", cost.longValue(),
                "timestamp", executedAt
        ));
    }

    private void loadPortfolioIfAbsent(String userId) {
        if (balanceCache.containsKey(userId)) {
            return;
        }

        User user = userRepository.findById(userId)
                .orElse(User.builder().id(userId).coinBalance(INITIAL_BALANCE).build());
        balanceCache.put(userId, user.getCoinBalance());

        Map<String, Long> shares = new ConcurrentHashMap<>();
        userShareRepository.findByUserId(userId)
                .forEach(share -> shares.put(share.getStock().getChannelId(), share.getQuantity()));
        sharesCache.put(userId, shares);
    }

    // Issue #17: 장기 운영 시 userLocks/stockLocks 맵 무한 증가 방지 — 미사용 락 정기 제거
    @Scheduled(fixedDelay = 300_000)
    public void cleanupIdleLocks() {
        userLocks.entrySet().removeIf(e -> !e.getValue().isLocked() && e.getValue().getQueueLength() == 0);
        stockLocks.entrySet().removeIf(e -> !e.getValue().isLocked() && e.getValue().getQueueLength() == 0);
    }
}
