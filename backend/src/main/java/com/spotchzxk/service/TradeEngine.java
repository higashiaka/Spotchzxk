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
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

@Service
@RequiredArgsConstructor
@Slf4j
public class TradeEngine {

    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(1_000_000);
    private static final double PRICE_IMPACT_PER_SHARE = 0.0005;

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
                return executeMarketOrder(userId, channelId, isBuy, qty, req.getEstimatedPrice(), true);
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
    }

    public void evictAllPortfolioCaches() {
        balanceCache.clear();
        sharesCache.clear();
    }

    public TradeResponse cancelLimitOrder(String userId, String orderId) {
        BigDecimal[] newBalance = new BigDecimal[1];
        runWithUserLock(userId, () -> newBalance[0] = cancelLimitOrderLocked(userId, orderId));

        evictUserCache(userId);
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

    private TradeResponse executeMarketOrder(String userId, String channelId,
                                             boolean isBuy, long qty,
                                             BigDecimal fallbackPrice,
                                             boolean processPendingAfterExecution) {
        BigDecimal currentPrice = loadPrice(channelId, fallbackPrice);
        TradePrices prices = calculateTradePrices(currentPrice, isBuy, qty);
        BigDecimal cost = prices.executionPrice().multiply(BigDecimal.valueOf(qty));
        long executedAt = System.currentTimeMillis();

        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, Long> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        long heldQty = shares.getOrDefault(channelId, 0L);

        validateTrade(userId, channelId, isBuy, qty, cost, currentBalance, heldQty);
        String streamerName = persistTrade(userId, channelId, isBuy, qty, fallbackPrice,
                prices.executionPrice(), prices.finalPrice(), cost, executedAt);
        BigDecimal newBalance = updateCaches(userId, channelId, isBuy, qty, prices.finalPrice(),
                currentBalance, shares, heldQty, cost);
        broadcastTrade(channelId, streamerName, isBuy, qty, prices.finalPrice(), executedAt);
        if (processPendingAfterExecution) {
            processPendingLimitOrders(channelId);
        }

        return new TradeResponse("executed", prices.executionPrice(), newBalance,
                BigDecimal.ZERO, UUID.randomUUID().toString(), "market");
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

    private TradePrices calculateLimitPrices(BigDecimal currentPrice, boolean isBuy, long qty, BigDecimal limitPrice) {
        TradePrices prices = calculateTradePrices(currentPrice, isBuy, qty);
        if (isBuy && prices.executionPrice().compareTo(limitPrice) > 0) {
            throw new IllegalStateException("Limit price is too low for this quantity.");
        }
        return prices;
    }

    private TradeResponse executeImmediateLimitOrder(String userId, String channelId, boolean isBuy, long qty,
                                                     BigDecimal fallbackPrice, BigDecimal limitPrice) {
        BigDecimal currentPrice = loadPrice(channelId, fallbackPrice);
        TradePrices prices = calculateLimitPrices(currentPrice, isBuy, qty, limitPrice);
        BigDecimal cost = prices.executionPrice().multiply(BigDecimal.valueOf(qty));
        long executedAt = System.currentTimeMillis();

        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, Long> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        long heldQty = shares.getOrDefault(channelId, 0L);

        validateTrade(userId, channelId, isBuy, qty, cost, currentBalance, heldQty);
        String orderId = UUID.randomUUID().toString();
        String streamerName = persistTrade(userId, channelId, isBuy, qty, fallbackPrice,
                prices.executionPrice(), prices.finalPrice(), cost, executedAt, orderId, "limit", limitPrice);
        BigDecimal newBalance = updateCaches(userId, channelId, isBuy, qty, prices.finalPrice(),
                currentBalance, shares, heldQty, cost);
        broadcastTrade(channelId, streamerName, isBuy, qty, prices.finalPrice(), executedAt);
        processPendingLimitOrders(channelId);

        return new TradeResponse("executed", prices.executionPrice(), newBalance, BigDecimal.ZERO, orderId, "limit");
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
        return priceCache.computeIfAbsent(channelId, k ->
                stockRepository.findById(k)
                        .map(stock -> BigDecimal.valueOf(stock.getCurrentPrice()))
                        .orElse(fallbackPrice));
    }

    private BigDecimal calculateExecutedPrice(BigDecimal currentPrice, boolean isBuy, long qty) {
        double rate = priceImpactRate(isBuy);
        double finalPriceRaw = currentPrice.doubleValue() * Math.pow(rate, qty);
        if (!Double.isFinite(finalPriceRaw) || finalPriceRaw > Integer.MAX_VALUE) {
            throw new IllegalStateException("Order quantity is too large.");
        }
        return BigDecimal.valueOf(Math.max(1.0, finalPriceRaw))
                .setScale(0, RoundingMode.HALF_UP);
    }

    TradePrices calculateTradePrices(BigDecimal currentPrice, boolean isBuy, long qty) {
        BigDecimal finalPrice = calculateExecutedPrice(currentPrice, isBuy, qty);
        BigDecimal averagePrice = calculateAverageExecutionPrice(currentPrice, isBuy, qty);
        return new TradePrices(averagePrice, finalPrice);
    }

    BigDecimal calculateAverageExecutionPrice(BigDecimal currentPrice, boolean isBuy, long qty) {
        double rate = priceImpactRate(isBuy);
        double start = currentPrice.doubleValue();
        double total;
        if (qty <= 0) {
            total = start;
        } else if (isBuy) {
            total = start * rate * (Math.pow(rate, qty) - 1.0) / (rate - 1.0);
        } else {
            total = start * rate * (1.0 - Math.pow(rate, qty)) / (1.0 - rate);
        }
        if (!Double.isFinite(total)) {
            throw new IllegalStateException("Order quantity is too large.");
        }
        double average = total / Math.max(1, qty);
        if (!Double.isFinite(average)) {
            throw new IllegalStateException("Order quantity is too large.");
        }
        if (average > Integer.MAX_VALUE) {
            throw new IllegalStateException("Order quantity is too large.");
        }
        return BigDecimal.valueOf(Math.max(1.0, average))
                .setScale(0, RoundingMode.HALF_UP);
    }

    private double priceImpactRate(boolean isBuy) {
        double buyRate = 1.0 + PRICE_IMPACT_PER_SHARE;
        return isBuy ? buyRate : 1.0 / buyRate;
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

    private String persistTrade(String userId, String channelId, boolean isBuy, long qty,
                                BigDecimal fallbackPrice, BigDecimal executedPrice, BigDecimal finalPrice,
                                BigDecimal cost, long executedAt) {
        return persistTrade(userId, channelId, isBuy, qty, fallbackPrice, executedPrice, finalPrice, cost, executedAt,
                UUID.randomUUID().toString(), "market", null);
    }

    private String persistTrade(String userId, String channelId, boolean isBuy, long qty,
                                BigDecimal fallbackPrice, BigDecimal executedPrice, BigDecimal finalPrice,
                                BigDecimal cost, long executedAt,
                                String orderId, String orderMode, BigDecimal limitPrice) {
        return new TransactionTemplate(txManager).execute(status -> {
            Stock stock = stockRepository.findById(channelId).orElseThrow();
            User user = getOrCreateUser(userId);

            updateStock(stock, isBuy, qty, finalPrice);
            BigDecimal realizedProfit = updateUserShareAndCalculateProfit(user, stock, channelId, isBuy, qty, cost);
            addToUserBalance(userId, isBuy ? cost.negate() : cost);
            if (!isBuy) {
                addToUserRealizedProfit(userId, realizedProfit);
            }
            saveOrder(userId, channelId, isBuy, qty, fallbackPrice, executedPrice, executedAt,
                    orderId, orderMode, limitPrice, "completed");
            return stock.getStreamerName();
        });
    }

    private User getOrCreateUser(String userId) {
        return userRepository.findById(userId)
                .orElseGet(() -> userRepository.save(User.builder().id(userId).coinBalance(INITIAL_BALANCE).build()));
    }

    private void updateStock(Stock stock, boolean isBuy, long qty, BigDecimal executedPrice) {
        stock.applyTrade(executedPrice.intValue(), isBuy, qty);
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
                .build());
    }

    private BigDecimal reservePendingLimitOrder(String userId, String channelId, boolean isBuy, long qty,
                                                BigDecimal fallbackPrice, BigDecimal limitPrice,
                                                BigDecimal reserveAmount, String orderId) {
        return new TransactionTemplate(txManager).execute(status -> {
            Stock stock = stockRepository.findById(channelId).orElseThrow();
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

    private void executePendingLimitOrder(Order order) {
        boolean isBuy = "buy".equals(order.getType());
        long executedAt = System.currentTimeMillis();
        TradePrices prices = new TransactionTemplate(txManager).execute(status -> {
            Order freshOrder = orderRepository.findByIdForUpdate(order.getId()).orElse(null);
            if (freshOrder == null || !"pending".equals(freshOrder.getStatus())) {
                return null;
            }

            boolean freshIsBuy = "buy".equals(freshOrder.getType());
            Stock stock = stockRepository.findById(freshOrder.getStreamerId()).orElseThrow();
            User user = userRepository.findById(freshOrder.getUserId())
                    .orElseThrow(() -> new IllegalStateException("User not found."));
            BigDecimal currentPrice = BigDecimal.valueOf(Math.max(1, stock.getCurrentPrice()));
            TradePrices calculatedPrices;
            try {
                calculatedPrices = calculateLimitPrices(currentPrice, freshIsBuy, freshOrder.getQuantity(), freshOrder.getLimitPrice());
            } catch (IllegalStateException e) {
                return null;
            }
            BigDecimal cost = calculatedPrices.executionPrice().multiply(BigDecimal.valueOf(freshOrder.getQuantity()));

            if (freshIsBuy) {
                BigDecimal reserved = freshOrder.getLimitPrice().multiply(BigDecimal.valueOf(freshOrder.getQuantity()));
                BigDecimal refund = reserved.subtract(cost).max(BigDecimal.ZERO);
                updateUserShareAndCalculateProfit(user, stock, freshOrder.getStreamerId(), true,
                        freshOrder.getQuantity(), cost);
                if (refund.compareTo(BigDecimal.ZERO) > 0) {
                    addToUserBalance(user.getId(), refund);
                }
            } else {
                UserShare share = userShareRepository.findByUserIdAndStockChannelId(user.getId(), freshOrder.getStreamerId())
                        .orElseThrow(() -> new IllegalStateException("Insufficient shares."));
                if (share.getQuantity() < freshOrder.getQuantity()) {
                    freshOrder.cancel();
                    orderRepository.save(freshOrder);
                    return null;
                }
                BigDecimal profit = calculateRealizedProfit(share, freshOrder.getQuantity(), cost);
                updateSoldShare(share, freshOrder.getQuantity());
                addToUserBalance(user.getId(), cost);
                addToUserRealizedProfit(user.getId(), profit);
            }

            updateStock(stock, freshIsBuy, freshOrder.getQuantity(), calculatedPrices.finalPrice());
            freshOrder.complete(calculatedPrices.executionPrice(), executedAt);
            orderRepository.save(freshOrder);
            return calculatedPrices;
        });

        if (prices == null) {
            evictUserCache(order.getUserId());
            return;
        }

        priceCache.put(order.getStreamerId(), prices.finalPrice());
        evictUserCache(order.getUserId());
        String streamerName = stockRepository.findById(order.getStreamerId())
                .map(Stock::getStreamerName)
                .orElse(order.getStreamerId());
        broadcastTrade(order.getStreamerId(), streamerName, isBuy, order.getQuantity(), prices.finalPrice(), executedAt);
        messagingTemplate.convertAndSend("/topic/orders/" + order.getUserId(),
                Map.of("orderId", order.getId(), "status", "completed"));
    }

    private BigDecimal updateCaches(String userId, String channelId, boolean isBuy, long qty,
                                    BigDecimal executedPrice, BigDecimal currentBalance,
                                    Map<String, Long> shares, long heldQty, BigDecimal cost) {
        priceCache.put(channelId, executedPrice);

        BigDecimal newBalance = isBuy
                ? currentBalance.subtract(cost)
                : currentBalance.add(cost);
        balanceCache.put(userId, newBalance);

        long newHeldQty = isBuy ? heldQty + qty : heldQty - qty;
        shares.put(channelId, newHeldQty);
        return newBalance;
    }

    private void broadcastTrade(String channelId, String streamerName, boolean isBuy, long qty,
                                BigDecimal executedPrice, long executedAt) {
        candleService.onTrade(channelId, executedPrice, executedAt);
        messagingTemplate.convertAndSend("/topic/prices/" + channelId,
                Map.of("streamerId", channelId, "price", executedPrice));
        messagingTemplate.convertAndSend("/topic/trades", Map.of(
                "streamerId", channelId,
                "streamerName", streamerName != null ? streamerName : channelId,
                "type", isBuy ? "buy" : "sell",
                "quantity", qty,
                "price", executedPrice,
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

    record TradePrices(BigDecimal executionPrice, BigDecimal finalPrice) {
    }
}
