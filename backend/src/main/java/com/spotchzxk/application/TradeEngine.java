package com.spotchzxk.application;

import com.spotchzxk.presentation.dto.TradeRequest;
import com.spotchzxk.presentation.dto.TradeResponse;
import com.spotchzxk.domain.order.entity.Order;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.entity.UserShare;
import com.spotchzxk.domain.order.repository.OrderRepository;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import com.spotchzxk.domain.trading.policy.AntiWhalePolicy;
import com.spotchzxk.domain.trading.service.AmmCalculator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.BigInteger;
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

    // Issue #4: raised initial balance to 10,000,000 (was 1,000,000) to match megaphone/stock-add costs
    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(10_000_000);
    private static final int PRICE_SCALE = 6;

    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final StockRepository stockRepository;
    private final OrderRepository orderRepository;
    private final AsyncBroadcastService asyncBroadcast;
    private final PlatformTransactionManager txManager;
    private final CandleService candleService;

    private final ConcurrentHashMap<String, BigDecimal> balanceCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, BigDecimal>> sharesCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, BigDecimal> priceCache = new ConcurrentHashMap<>();
    // {coinReserve, shareReserve}
    private final ConcurrentHashMap<String, BigInteger[]> ammPoolCache = new ConcurrentHashMap<>();

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
                try {
                    if ("limit".equals(req.getOrderMode())) {
                        return submitLimitOrder(userId, channelId, isBuy, qty, req.getEstimatedPrice(), req.getLimitPrice());
                    }
        // Issue #5: pass slippage parameters directly to executeMarketOrder
                    return executeMarketOrder(userId, channelId, isBuy, qty, req.getEstimatedPrice(), true,
                            req.getMaxCoinIn(), req.getMinCoinOut());
                } catch (RuntimeException e) {
                    evictUserCache(userId);
                    evictStockCache(channelId);
                    throw e;
                }
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
            evictUserCache(userId);
        });

        asyncBroadcast.send("/topic/orders/" + userId,
                Map.of("orderId", orderId, "status", "cancelled"));
        return new TradeResponse("cancelled", BigDecimal.ZERO, newBalance[0], BigDecimal.ZERO, orderId, "limit");
    }

    private BigDecimal cancelLimitOrderLocked(String userId, String orderId) {
        return new TransactionTemplate(txManager).execute(status -> {
            Order order = orderRepository.findByIdForUpdate(orderId)
                    .orElseThrow(() -> new IllegalStateException("존재하지 않는 주문입니다."));
            if (!userId.equals(order.getUserId())) {
                throw new IllegalStateException("존재하지 않는 주문입니다.");
            }
            if (!"pending".equals(order.getStatus())) {
                throw new IllegalStateException("이미 처리되었거나 취소된 주문입니다.");
            }

            BigDecimal refund = BigDecimal.ZERO;
            if ("buy".equals(order.getType())) {
                refund = limitReservationAmount(order.getLimitPrice(), order.getQuantity(), true);
            }

            order.cancel();
            orderRepository.save(order);
            addToUserBalance(userId, refund);
            return userRepository.findById(userId)
                    .map(User::getCoinBalance)
                    .orElseThrow(() -> new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요."));
        });
    }

        // Issue #5: validate slippage bounds (maxCoinIn / minCoinOut) before executing
        // Issue #1: pre-generate orderId so persistTrade and the caller share one stable ID (previously two UUIDs were created)
    private TradeResponse executeMarketOrder(String userId, String channelId,
                                             boolean isBuy, long qty,
                                             BigDecimal fallbackPrice,
                                             boolean processPendingAfterExecution,
                                             BigDecimal maxCoinIn, BigDecimal minCoinOut) {
        AmmCalculator.AmmResult amm = calculateAmmTrade(channelId, isBuy, qty);
        BigDecimal userNet = new BigDecimal(amm.userNetAmount());

        if (isBuy && maxCoinIn != null && userNet.compareTo(maxCoinIn) > 0) {
            throw new IllegalStateException("가격 변동이 커서 주문이 취소되었습니다. 다시 시도해 주세요. (실제 비용 " + userNet + " > 최대 허용 " + maxCoinIn + ")");
        }
        if (!isBuy && minCoinOut != null && userNet.compareTo(minCoinOut) < 0) {
            throw new IllegalStateException("가격 변동이 커서 주문이 취소되었습니다. 다시 시도해 주세요. (실제 수령 " + userNet + " < 최소 허용 " + minCoinOut + ")");
        }

        long executedAt = System.currentTimeMillis();

        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, BigDecimal> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        BigDecimal heldQty = shares.getOrDefault(channelId, BigDecimal.ZERO);

        validateTrade(userId, channelId, isBuy, qty, isBuy ? userNet : BigDecimal.ZERO, currentBalance, heldQty);

        String orderId = UUID.randomUUID().toString();
        TradePersistenceResult savedTrade = persistTrade(userId, channelId, amm, isBuy, qty, fallbackPrice, executedAt, orderId, "market", null);
        BigDecimal newBalance = updateCaches(userId, channelId, isBuy, qty, amm, savedTrade.poolForCache(), currentBalance, shares, heldQty);
        broadcastTrade(channelId, savedTrade.streamerName(), isBuy, qty, amm.newPrice(), executedAt, userNet,
                savedTrade.poolForCache()[0], savedTrade.poolForCache()[1], orderId);
        if (processPendingAfterExecution) {
            processPendingLimitOrders(channelId);
        }

        return new TradeResponse("executed", amm.avgPrice(), newBalance,
                BigDecimal.ZERO, orderId, "market");
    }

    private TradeResponse submitLimitOrder(String userId, String channelId, boolean isBuy, long qty,
                                           BigDecimal fallbackPrice, BigDecimal limitPrice) {
        if (limitPrice == null || limitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalStateException("지정가 주문에는 가격을 입력해야 합니다.");
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

        // Check whether current price is within limit; returns null if not yet executable
    private AmmCalculator.AmmResult calcAmmTradeForLimit(String channelId, boolean isBuy, long qty,
                                                          BigDecimal limitPrice) {
        AmmCalculator.AmmResult amm = calculateAmmTrade(channelId, isBuy, qty);
        BigDecimal reservation = limitReservationAmount(limitPrice, qty, isBuy);
        BigDecimal userNetAmount = new BigDecimal(amm.userNetAmount());

        if (isBuy && userNetAmount.compareTo(reservation) > 0) {
            return null;
        }
        if (!isBuy && userNetAmount.compareTo(reservation) < 0) {
            return null;
        }
        return amm;
    }

    private TradeResponse executeImmediateLimitOrder(String userId, String channelId, boolean isBuy, long qty,
                                                     BigDecimal fallbackPrice, BigDecimal limitPrice) {
        AmmCalculator.AmmResult amm = calcAmmTradeForLimit(channelId, isBuy, qty, limitPrice);
        if (amm == null) throw new IllegalStateException("현재 시장가가 지정가보다 많이 벗어났습니다.");
        BigDecimal userNet = new BigDecimal(amm.userNetAmount());
        long executedAt = System.currentTimeMillis();

        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, BigDecimal> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        BigDecimal heldQty = shares.getOrDefault(channelId, BigDecimal.ZERO);

        validateTrade(userId, channelId, isBuy, qty, isBuy ? userNet : BigDecimal.ZERO, currentBalance, heldQty);
        String orderId = UUID.randomUUID().toString();
        TradePersistenceResult savedTrade = persistTrade(userId, channelId, amm, isBuy, qty, fallbackPrice,
                executedAt, orderId, "limit", limitPrice);
        BigDecimal newBalance = updateCaches(userId, channelId, isBuy, qty, amm, savedTrade.poolForCache(), currentBalance, shares, heldQty);
        broadcastTrade(channelId, savedTrade.streamerName(), isBuy, qty, amm.newPrice(), executedAt, userNet,
                savedTrade.poolForCache()[0], savedTrade.poolForCache()[1], orderId);
        processPendingLimitOrders(channelId);

        return new TradeResponse("executed", amm.avgPrice(), newBalance, BigDecimal.ZERO, orderId, "limit");
    }

    private TradeResponse createPendingLimitOrder(String userId, String channelId, boolean isBuy, long qty,
                                                  BigDecimal fallbackPrice, BigDecimal limitPrice) {
        BigDecimal reserveAmount = limitReservationAmount(limitPrice, qty, isBuy);
        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, BigDecimal> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        BigDecimal heldQty = shares.getOrDefault(channelId, BigDecimal.ZERO);

        validateLimitOrder(channelId, userId, isBuy, qty, reserveAmount, currentBalance, heldQty);
        String orderId = UUID.randomUUID().toString();
        BigDecimal newBalance = reservePendingLimitOrder(userId, channelId, isBuy, qty, fallbackPrice, limitPrice,
                reserveAmount, orderId);

        if (isBuy) {
            balanceCache.put(userId, newBalance);
        }

        return new TradeResponse("pending", BigDecimal.ZERO, newBalance, BigDecimal.ZERO, orderId, "limit");
    }

    private BigDecimal limitReservationAmount(BigDecimal limitPrice, long qty, boolean isBuy) {
        BigDecimal gross = limitPrice.multiply(BigDecimal.valueOf(qty)).setScale(0, RoundingMode.CEILING);
        BigInteger grossAmount = gross.toBigIntegerExact();
        BigInteger[] fee = AmmCalculator.fee(grossAmount);
        BigInteger totalFee = fee[0].add(fee[1]);
        BigInteger amount = isBuy ? grossAmount.add(totalFee) : grossAmount.subtract(totalFee).max(BigInteger.ZERO);
        return new BigDecimal(amount);
    }

    private BigDecimal loadPrice(String channelId, BigDecimal fallbackPrice) {
        BigInteger[] pool = loadAmmPool(channelId);
        return AmmCalculator.price(pool[0], pool[1]);
    }

    private BigInteger[] loadAmmPool(String channelId) {
        return ammPoolCache.computeIfAbsent(channelId, k ->
                stockRepository.findById(k)
                        .map(s -> new BigInteger[]{s.getCoinReserve(), s.getShareReserve()})
                        .orElseThrow(() -> new IllegalStateException("종목 정보를 찾을 수 없습니다.")));
    }

    AmmCalculator.AmmResult calculateAmmTrade(String channelId, boolean isBuy, long qty) {
        BigInteger[] pool = loadAmmPool(channelId);
        return isBuy
                ? AmmCalculator.calcBuy(pool[0], pool[1], qty)
                : AmmCalculator.calcSell(pool[0], pool[1], qty);
    }

    private void validateTrade(String userId, String channelId, boolean isBuy, long qty, BigDecimal cost,
                               BigDecimal currentBalance, BigDecimal heldQty) {
        Stock stock = stockRepository.findById(channelId)
                .orElseThrow(() -> new IllegalStateException("종목 정보를 찾을 수 없습니다."));
        if (stock.isTradingSuspended()) {
            throw new IllegalStateException("현재 거래가 정지된 종목입니다.");
        }

        if (!isBuy) {
            long pendingSellQty = orderRepository.sumPendingSellQuantity(userId, channelId);
            if (heldQty.subtract(BigDecimal.valueOf(pendingSellQty)).compareTo(BigDecimal.valueOf(qty)) < 0) {
                throw new IllegalStateException("보유 수량이 부족합니다.");
            }
            return;
        }

        if (currentBalance.compareTo(cost) < 0) {
            throw new IllegalStateException("잔고가 부족합니다.");
        }
        boolean isNewListing = stock.getListedAt() != null
                && ChronoUnit.HOURS.between(stock.getListedAt(), LocalDateTime.now()) < AntiWhalePolicy.NEW_LISTING_HOURS;
        if (isNewListing) {
            long pendingBuyQty = orderRepository.sumPendingBuyQuantity(userId, channelId);
            if (heldQty.add(BigDecimal.valueOf(pendingBuyQty)).add(BigDecimal.valueOf(qty))
                    .compareTo(BigDecimal.valueOf(AntiWhalePolicy.NEW_LISTING_CAP)) > 0) {
                throw new IllegalStateException("신규 상장 초기에는 최대 200주까지 보유 가능합니다.");
            }
        }

        if (stock.getTotalSupply().compareTo(BigDecimal.ZERO) > 0
                && stock.getIssuedShares().add(BigDecimal.valueOf(qty)).compareTo(stock.getTotalSupply()) > 0) {
            throw new IllegalStateException("해당 종목의 최대 발행 한도를 초과합니다.");
        }
    }

    private void validateLimitOrder(String channelId, String userId, boolean isBuy, long qty, BigDecimal reserveAmount,
                                    BigDecimal currentBalance, BigDecimal heldQty) {
        if (isBuy) {
            validateTrade(userId, channelId, true, qty, reserveAmount, currentBalance, heldQty);
            Stock stock = stockRepository.findById(channelId)
                    .orElseThrow(() -> new IllegalStateException("종목 정보를 찾을 수 없습니다."));
            long pendingBuyQty = orderRepository.sumPendingBuyQuantityByStreamerId(channelId);
            if (stock.getTotalSupply().compareTo(BigDecimal.ZERO) > 0
                    && stock.getIssuedShares().add(BigDecimal.valueOf(pendingBuyQty + qty)).compareTo(stock.getTotalSupply()) > 0) {
                throw new IllegalStateException("해당 종목의 최대 발행 한도를 초과합니다.");
            }
            return;
        }

        long pendingSellQty = orderRepository.sumPendingSellQuantity(userId, channelId);
        if (heldQty.subtract(BigDecimal.valueOf(pendingSellQty)).compareTo(BigDecimal.valueOf(qty)) < 0) {
            throw new IllegalStateException("보유 수량이 부족합니다.");
        }
    }

    private TradePersistenceResult persistTrade(String userId, String channelId, AmmCalculator.AmmResult amm,
                                                boolean isBuy, long qty, BigDecimal fallbackPrice, long executedAt,
                                                String orderId, String orderMode, BigDecimal limitPrice) {
        BigDecimal userNet = new BigDecimal(amm.userNetAmount());
        return new TransactionTemplate(txManager).execute(status -> {
            Stock stock = stockRepository.findByIdForUpdate(channelId)
                    .orElseThrow(() -> new IllegalStateException("종목 정보를 찾을 수 없습니다."));
            User user = getOrCreateUser(userId);

            BigInteger[] poolForCache = updateStock(stock, isBuy, qty, amm, userNet);
            BigDecimal realizedProfit = updateUserShareAndCalculateProfit(user, stock, channelId, isBuy, qty, userNet);
            addToUserBalance(userId, isBuy ? userNet.negate() : userNet);
            if (!isBuy) {
                addToUserRealizedProfit(userId, realizedProfit);
            }
            saveOrder(userId, channelId, isBuy, qty, fallbackPrice, amm.avgPrice(), executedAt,
                    orderId, orderMode, limitPrice, "completed");
            return new TradePersistenceResult(stock.getStreamerName(), poolForCache);
        });
    }

    private User getOrCreateUser(String userId) {
        return userRepository.findById(userId)
                .orElseGet(() -> userRepository.save(User.builder().id(userId).coinBalance(INITIAL_BALANCE).build()));
    }

    private BigInteger[] updateStock(Stock stock, boolean isBuy, long qty, AmmCalculator.AmmResult amm, BigDecimal userNet) {
        stock.applyAmmTrade(amm.newPool()[0], amm.newPool()[1], amm.feePoolAmount());
        stock.applyTrade(amm.newPrice(), isBuy, qty, userNet);
        stockRepository.save(stock);
        return new BigInteger[]{stock.getCoinReserve(), stock.getShareReserve()};
    }

    private BigDecimal updateUserShareAndCalculateProfit(User user, Stock stock, String channelId, boolean isBuy,
                                                         long qty, BigDecimal cost) {
        if (isBuy) {
            UserShare share = userShareRepository.findByUserIdAndStockChannelId(user.getId(), channelId)
                    .orElseGet(() -> UserShare.builder()
                            .user(user)
                            .stock(stock)
                            .quantity(BigDecimal.ZERO)
                            .preStreamQuantity(BigDecimal.ZERO)
                            .avgPrice(BigDecimal.ZERO)
                            .build());
            updateBoughtShare(share, qty, cost);
            return BigDecimal.ZERO;
        } else {
            UserShare share = userShareRepository.findByUserIdAndStockChannelId(user.getId(), channelId)
                    .orElseThrow(() -> new IllegalStateException("보유 수량이 부족합니다."));
            if (share.getQuantity().compareTo(BigDecimal.valueOf(qty)) < 0) {
                throw new IllegalStateException("보유 수량이 부족합니다.");
            }
            BigDecimal profit = calculateRealizedProfit(share, qty, cost);
            updateSoldShare(share, qty);
            return profit;
        }
    }

    private void updateBoughtShare(UserShare share, long qty, BigDecimal cost) {
        BigDecimal prevQty = share.getQuantity();
        BigDecimal newQty = prevQty.add(BigDecimal.valueOf(qty));
        BigDecimal prevAvg = share.getAvgPrice() != null ? share.getAvgPrice() : BigDecimal.ZERO;
        BigDecimal newAvg = prevAvg.multiply(prevQty)
                .add(cost)
                .divide(newQty, PRICE_SCALE, RoundingMode.HALF_UP);
        share.updateOnBuy(newQty, newAvg);
        userShareRepository.save(share);
    }

    private void updateSoldShare(UserShare share, long qty) {
        BigDecimal newQty = share.getQuantity().subtract(BigDecimal.valueOf(qty));
        if (newQty.compareTo(BigDecimal.ZERO) <= 0) {
            userShareRepository.delete(share);
            return;
        }
        share.updateOnSell(newQty);
        userShareRepository.save(share);
    }

    private BigDecimal calculateRealizedProfit(UserShare share, long qty, BigDecimal proceeds) {
        BigDecimal avgBuyPrice = share.getAvgPrice() != null ? share.getAvgPrice() : BigDecimal.ZERO;
        BigDecimal costBasis = avgBuyPrice.multiply(BigDecimal.valueOf(qty));
        return proceeds.subtract(costBasis).setScale(PRICE_SCALE, RoundingMode.HALF_UP);
    }

    private void addToUserBalance(String userId, BigDecimal delta) {
        if (delta.compareTo(BigDecimal.ZERO) == 0) {
            return;
        }
        if (userRepository.addToBalance(userId, delta) != 1) {
            throw new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
        }
    }

    private void addToUserRealizedProfit(String userId, BigDecimal delta) {
        if (delta.compareTo(BigDecimal.ZERO) == 0) {
            return;
        }
        if (userRepository.addToRealizedProfit(userId, delta) != 1) {
            throw new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
        }
    }

    private long toLongCap(BigDecimal value) {
        if (value.compareTo(BigDecimal.valueOf(Long.MAX_VALUE)) > 0) {
            return Long.MAX_VALUE;
        }
        if (value.compareTo(BigDecimal.valueOf(Long.MIN_VALUE)) < 0) {
            return Long.MIN_VALUE;
        }
        return value.longValue();
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
                    .orElseThrow(() -> new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요."));
            if (isBuy) {
                newBalance = newBalance.subtract(reserveAmount);
                if (newBalance.compareTo(BigDecimal.ZERO) < 0) {
                    throw new IllegalStateException("잔고가 부족합니다.");
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

        // Issue #11: re-evaluate AMM price after each fill so later orders see updated reserves
    private void processPendingLimitOrders(String channelId) {
        try {
            for (Order order : orderRepository.findByStreamerIdAndStatusOrderByCreatedAtAsc(channelId, "pending")) {
                try {
                    BigDecimal currentPrice = loadPrice(channelId, BigDecimal.valueOf(1));
                    boolean isBuy = "buy".equals(order.getType());
                    BigDecimal limitPrice = order.getLimitPrice();
                    if (limitPrice == null || !isLimitMarketable(currentPrice, isBuy, limitPrice)) {
                        continue;
                    }
                    executePendingLimitOrder(order);
                } catch (RuntimeException e) {
                    log.warn("Pending limit order processing failed: orderId={}, user={}, stock={}",
                            order.getId(), order.getUserId(), order.getStreamerId(), e);
                    evictUserCache(order.getUserId());
                    evictStockCache(order.getStreamerId());
                }
            }
        } catch (RuntimeException e) {
            log.warn("Pending limit order scan failed: stock={}", channelId, e);
            evictStockCache(channelId);
        }
    }

        // Issue #2: recalculate with DB-fresh reserves inside the transaction (cache may lag behind DB writes)
    private void executePendingLimitOrder(Order order) {
        boolean isBuy = "buy".equals(order.getType());
        long executedAt = System.currentTimeMillis();

        AmmCalculator.AmmResult[] resultHolder = new AmmCalculator.AmmResult[1];
        BigInteger[][] poolHolder = new BigInteger[1][];
        new TransactionTemplate(txManager).executeWithoutResult(status -> {
            Order freshOrder = orderRepository.findByIdForUpdate(order.getId()).orElse(null);
            if (freshOrder == null || !"pending".equals(freshOrder.getStatus())) return;

            boolean freshIsBuy = "buy".equals(freshOrder.getType());
            Stock stock = stockRepository.findById(freshOrder.getStreamerId()).orElseThrow();
            User user = userRepository.findById(freshOrder.getUserId())
                    .orElseThrow(() -> new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요."));

        // Recalculate AMM with DB-fresh reserves; cache may be stale after concurrent trades
            AmmCalculator.AmmResult amm = freshIsBuy
                    ? AmmCalculator.calcBuy(stock.getCoinReserve(), stock.getShareReserve(), freshOrder.getQuantity())
                    : AmmCalculator.calcSell(stock.getCoinReserve(), stock.getShareReserve(), freshOrder.getQuantity());

            BigDecimal userNet = new BigDecimal(amm.userNetAmount());
            BigDecimal reservation = freshOrder.getLimitPrice().multiply(BigDecimal.valueOf(freshOrder.getQuantity()));

        // Skip if limit condition is no longer met after recalculation
            if (!freshIsBuy && userNet.compareTo(reservation) < 0) return;

            if (freshIsBuy) {
                if (stock.getTotalSupply().compareTo(BigDecimal.ZERO) > 0
                        && stock.getIssuedShares().add(BigDecimal.valueOf(freshOrder.getQuantity())).compareTo(stock.getTotalSupply()) > 0) {
                    BigDecimal refund = limitReservationAmount(freshOrder.getLimitPrice(), freshOrder.getQuantity(), true);
                    freshOrder.cancel();
                    orderRepository.save(freshOrder);
                    addToUserBalance(freshOrder.getUserId(), refund);
                    return;
                }
                BigDecimal reserved = limitReservationAmount(freshOrder.getLimitPrice(), freshOrder.getQuantity(), true);
                BigDecimal refund = reserved.subtract(userNet).max(BigDecimal.ZERO);
                updateUserShareAndCalculateProfit(user, stock, freshOrder.getStreamerId(), true,
                        freshOrder.getQuantity(), userNet);
                if (refund.compareTo(BigDecimal.ZERO) > 0) {
                    addToUserBalance(user.getId(), refund);
                }
            } else {
                UserShare share = userShareRepository.findByUserIdAndStockChannelId(
                        user.getId(), freshOrder.getStreamerId()).orElse(null);
                if (share == null || share.getQuantity().compareTo(BigDecimal.valueOf(freshOrder.getQuantity())) < 0) {
                    freshOrder.cancel();
                    orderRepository.save(freshOrder);
                    return;
                }
                BigDecimal profit = calculateRealizedProfit(share, freshOrder.getQuantity(), userNet);
                updateSoldShare(share, freshOrder.getQuantity());
                addToUserBalance(user.getId(), userNet);
                addToUserRealizedProfit(user.getId(), profit);
            }

            poolHolder[0] = updateStock(stock, freshIsBuy, freshOrder.getQuantity(), amm, userNet);
            freshOrder.complete(amm.avgPrice(), executedAt);
            orderRepository.save(freshOrder);
            resultHolder[0] = amm;
        });

        if (resultHolder[0] == null) {
            evictUserCache(order.getUserId());
            return;
        }

        AmmCalculator.AmmResult amm = resultHolder[0];
        BigInteger[] poolForCache = poolHolder[0] != null ? poolHolder[0] : amm.newPool();
        ammPoolCache.put(order.getStreamerId(), poolForCache);
        priceCache.put(order.getStreamerId(), amm.newPrice());
        evictUserCache(order.getUserId());
        String streamerName = stockRepository.findById(order.getStreamerId())
                .map(Stock::getStreamerName)
                .orElse(order.getStreamerId());
        broadcastTrade(order.getStreamerId(), streamerName, isBuy, order.getQuantity(), amm.newPrice(), executedAt,
                new BigDecimal(amm.userNetAmount()), poolForCache[0], poolForCache[1], order.getId());
        asyncBroadcast.send("/topic/orders/" + order.getUserId(),
                Map.of("orderId", order.getId(), "status", "completed"));
    }

    private BigDecimal updateCaches(String userId, String channelId, boolean isBuy, long qty,
                                    AmmCalculator.AmmResult amm, BigInteger[] poolForCache, BigDecimal currentBalance,
                                    Map<String, BigDecimal> shares, BigDecimal heldQty) {
        ammPoolCache.put(channelId, poolForCache);
        priceCache.put(channelId, amm.newPrice());

        BigDecimal userNet = new BigDecimal(amm.userNetAmount());
        BigDecimal newBalance = isBuy
                ? currentBalance.subtract(userNet)
                : currentBalance.add(userNet);
        balanceCache.put(userId, newBalance);

        shares.put(channelId, isBuy ? heldQty.add(BigDecimal.valueOf(qty)) : heldQty.subtract(BigDecimal.valueOf(qty)));
        return newBalance;
    }

    private record TradePersistenceResult(String streamerName, BigInteger[] poolForCache) {
    }

    // Issue #18: candleService.onTrade瑜?鍮꾨룞湲??몄텧??stockLock 蹂댁쑀 ?곹깭?먯꽌??紐⑤땲????以묒꺽 ?쒓굅
    private void broadcastTrade(String channelId, String streamerName, boolean isBuy, long qty,
                                BigDecimal executedPrice, long executedAt, BigDecimal cost,
                                BigInteger coinReserve, BigInteger shareReserve, String orderId) {
        CompletableFuture.runAsync(() -> candleService.onTrade(channelId, executedPrice, executedAt));
        asyncBroadcast.send("/topic/prices/" + channelId,
                Map.of("streamerId", channelId, "price", executedPrice.toPlainString()));
        asyncBroadcast.send("/topic/trades", Map.of(
                "id", orderId,
                "streamerId", channelId,
                "streamerName", streamerName != null ? streamerName : channelId,
                "type", isBuy ? "buy" : "sell",
                "quantity", qty,
                "price", executedPrice.toPlainString(),
                "tradingValue", toLongCap(cost),
                "coinReserve", coinReserve.toString(),
                "shareReserve", shareReserve.toString(),
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

        Map<String, BigDecimal> shares = new ConcurrentHashMap<>();
        userShareRepository.findByUserId(userId)
                .forEach(share -> shares.put(share.getStock().getChannelId(), share.getQuantity()));
        sharesCache.put(userId, shares);
    }

    // Issue #17: ?κ린 ?댁쁺 ??userLocks/stockLocks 留?臾댄븳 利앷? 諛⑹? ??誘몄궗?????뺢린 ?쒓굅
    @Scheduled(fixedDelay = 300_000)
    public void cleanupIdleLocks() {
        userLocks.entrySet().removeIf(e -> !e.getValue().isLocked() && e.getValue().getQueueLength() == 0);
        stockLocks.entrySet().removeIf(e -> !e.getValue().isLocked() && e.getValue().getQueueLength() == 0);
    }
}


