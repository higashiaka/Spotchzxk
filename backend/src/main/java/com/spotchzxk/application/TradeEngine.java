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
import com.spotchzxk.domain.trading.entity.TradeFailureLog;
import com.spotchzxk.domain.trading.policy.AntiWhalePolicy;
import com.spotchzxk.domain.trading.repository.TradeFailureLogRepository;
import com.spotchzxk.domain.trading.service.AmmCalculator;
import com.spotchzxk.domain.trading.service.MarketPrice;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import jakarta.annotation.PreDestroy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.locks.ReentrantLock;

@Service
@RequiredArgsConstructor
@Slf4j
public class TradeEngine {

    // Issue #4: raised initial balance to 10,000,000 (was 1,000,000) to match megaphone/stock-add costs
    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(10_000_000);
    private static final int PRICE_SCALE = 6;
    private static final BigDecimal MIN_STORABLE_PRICE = new BigDecimal("0.000001");
    private static final String SUSPENSION_REASON_INVALID_AMM_POOL = MarketPrice.REASON_INVALID_AMM_POOL;
    private static final java.time.ZoneId KST = java.time.ZoneId.of("Asia/Seoul");

    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final StockRepository stockRepository;
    private final OrderRepository orderRepository;
    private final AsyncBroadcastService asyncBroadcast;
    private final PlatformTransactionManager txManager;
    private final CandleService candleService;
    private final TradeFailureLogRepository tradeFailureLogRepository;

    // JVM-local caches. Horizontal scaling requires replacing these with a distributed cache
    // or routing each user's trading traffic to a single instance.
    private final ConcurrentHashMap<String, BigDecimal> balanceCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, BigDecimal>> sharesCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, BigDecimal> priceCache = new ConcurrentHashMap<>();
    // {coinReserve, shareReserve}
    private final ConcurrentHashMap<String, BigInteger[]> ammPoolCache = new ConcurrentHashMap<>();

    private final ConcurrentHashMap<String, ReentrantLock> userLocks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ReentrantLock> stockLocks = new ConcurrentHashMap<>();
    private final ExecutorService candleExecutor = Executors.newFixedThreadPool(2);

    @org.springframework.context.annotation.Lazy
    private final RankCacheService rankCacheService;

    @PreDestroy
    public void shutdownCandleExecutor() {
        candleExecutor.shutdown();
    }

    public TradeResponse submitTrade(TradeRequest req) {
        String userId = req.getUserId();
        String channelId = req.getStreamerId();
        boolean isBuy = "buy".equals(req.getType());
        BigInteger qty = req.getQuantity();
        boolean sellAll = req.isSellAll();

        if (sellAll && (isBuy || "limit".equals(req.getOrderMode()))) {
            throw validationError("100% 매도는 시장가 매도에서만 사용할 수 있습니다.");
        }

        ReentrantLock userLock = userLocks.computeIfAbsent(userId, k -> new ReentrantLock());
        ReentrantLock stockLock = stockLocks.computeIfAbsent(channelId, k -> new ReentrantLock());

        userLock.lock();
        try {
            loadPortfolioIfAbsent(userId);
            stockLock.lock();
            try {
                try {
                    if ("limit".equals(req.getOrderMode())) {
                        return submitLimitOrder(userId, channelId, isBuy, qty, req.getEstimatedPrice(), req.getLimitPrice(), req.isAllowPartial());
                    }
                    if (sellAll) {
                        return executeSellAllMarketOrder(userId, channelId, req.getEstimatedPrice());
                    }
        // Issue #5: pass slippage parameters directly to executeMarketOrder
                    return executeMarketOrder(userId, channelId, isBuy, qty, req.getEstimatedPrice(), true,
                            req.getMaxCoinIn(), req.getMinCoinOut());
                } catch (RuntimeException e) {
                    if (!(e instanceof TradeValidationException)) {
                        evictUserCache(userId);
                        evictStockCache(channelId);
                    }
                    recordTradeFailure(req, e.getMessage());
                    throw e;
                }
            } finally {
                stockLock.unlock();
            }
        } finally {
            userLock.unlock();
        }
    }

    private TradeResponse executeSellAllMarketOrder(String userId, String channelId, BigDecimal fallbackPrice) {
        BigDecimal heldQty = userShareRepository.findByUserIdAndStockChannelId(userId, channelId)
                .map(UserShare::getQuantity)
                .orElse(BigDecimal.ZERO);
        if (heldQty.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalStateException("보유 수량이 부족합니다.");
        }

        BigInteger wholeQty = heldQty.setScale(0, RoundingMode.FLOOR).toBigIntegerExact();
        BigDecimal fractionalQty = heldQty.subtract(new BigDecimal(wholeQty));
        if (wholeQty.signum() == 0) {
            return settleFractionalOnlySell(userId, channelId, heldQty, fallbackPrice);
        }

        AmmCalculator.AmmResult amm = calculateAmmTrade(channelId, false, wholeQty);
        long executedAt = System.currentTimeMillis();
        String orderId = UUID.randomUUID().toString();
        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, BigDecimal> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());

        TradePersistenceResult savedTrade = persistSellAllTrade(
                userId, channelId, amm, wholeQty, fractionalQty, fallbackPrice, executedAt, orderId);
        BigDecimal totalProceeds = new BigDecimal(amm.userNetAmount()).add(savedTrade.fractionalProceeds());
        BigDecimal newBalance = currentBalance.add(totalProceeds);
        balanceCache.put(userId, newBalance);
        shares.remove(channelId);
        priceCache.put(channelId, amm.newPrice());
        ammPoolCache.put(channelId, savedTrade.poolForCache());

        broadcastTrade(channelId, savedTrade.streamerName(), false, wholeQty, amm.newPrice(), executedAt,
                new BigDecimal(amm.userNetAmount()), savedTrade.poolForCache()[0], savedTrade.poolForCache()[1],
                savedTrade.dailyVolume(), savedTrade.dailyTradingValue(), orderId,
                savedTrade.tradingSuspended(), savedTrade.tradingSuspensionReason());
        processPendingLimitOrders(channelId);
        return new TradeResponse("executed", amm.newPrice().toPlainString(), newBalance.toPlainString(),
                "0", orderId, "market");
    }

    private TradePersistenceResult persistSellAllTrade(
            String userId, String channelId, AmmCalculator.AmmResult amm, BigInteger wholeQty,
            BigDecimal fractionalQty, BigDecimal fallbackPrice, long executedAt, String orderId) {
        return new TransactionTemplate(txManager).execute(status -> {
            Stock stock = stockRepository.findByIdForUpdate(channelId)
                    .orElseThrow(() -> new IllegalStateException("종목 정보를 찾을 수 없습니다."));
            User user = getOrCreateUser(userId);
            UserShare share = userShareRepository.findByUserIdAndStockChannelId(userId, channelId)
                    .orElseThrow(() -> new IllegalStateException("보유 수량이 부족합니다."));
            BigDecimal expectedQty = new BigDecimal(wholeQty).add(fractionalQty);
            if (share.getQuantity().compareTo(expectedQty) != 0) {
                throw new IllegalStateException("보유 수량이 변경되었습니다. 다시 시도해주세요.");
            }

            BigInteger[] poolForCache = updateStock(stock, false, wholeQty, amm, new BigDecimal(amm.userNetAmount()));
            BigDecimal fractionalProceeds = fractionalSellProceeds(fractionalQty, amm.newPrice());
            BigDecimal realizedProfit = new BigDecimal(amm.userNetAmount()).add(fractionalProceeds)
                    .subtract((share.getAvgPrice() == null ? BigDecimal.ZERO : share.getAvgPrice()).multiply(expectedQty))
                    .setScale(PRICE_SCALE, RoundingMode.HALF_UP);
            stock.removeFractionalIssuedShares(fractionalQty);
            stockRepository.save(stock);
            userShareRepository.delete(share);
            addToUserBalance(userId, new BigDecimal(amm.userNetAmount()).add(fractionalProceeds));
            addToUserRealizedProfit(userId, realizedProfit);
            saveOrder(userId, channelId, false, wholeQty, fallbackPrice, amm.newPrice(), executedAt,
                    orderId, "market", null, "completed");
            return new TradePersistenceResult(stock.getStreamerName(), poolForCache,
                    stock.getDailyVolume(), stock.getDailyTradingValue(), fractionalProceeds,
                    stock.isTradingSuspended(), stock.getTradingSuspensionReason());
        });
    }

    private TradeResponse settleFractionalOnlySell(
            String userId, String channelId, BigDecimal heldQty, BigDecimal fallbackPrice) {
        String orderId = UUID.randomUUID().toString();
        BigDecimal[] result = new BigDecimal[2];
        new TransactionTemplate(txManager).executeWithoutResult(status -> {
            Stock stock = stockRepository.findByIdForUpdate(channelId)
                    .orElseThrow(() -> new IllegalStateException("종목 정보를 찾을 수 없습니다."));
            UserShare share = userShareRepository.findByUserIdAndStockChannelId(userId, channelId)
                    .orElseThrow(() -> new IllegalStateException("보유 수량이 부족합니다."));
            if (share.getQuantity().compareTo(heldQty) != 0) {
                throw new IllegalStateException("보유 수량이 변경되었습니다. 다시 시도해주세요.");
            }
            BigDecimal proceeds = fractionalSellProceeds(heldQty, stock.getCurrentPrice());
            BigDecimal costBasis = (share.getAvgPrice() == null ? BigDecimal.ZERO : share.getAvgPrice()).multiply(heldQty);
            addToUserBalance(userId, proceeds);
            addToUserRealizedProfit(userId, proceeds.subtract(costBasis).setScale(PRICE_SCALE, RoundingMode.HALF_UP));
            stock.removeFractionalIssuedShares(heldQty);
            stockRepository.save(stock);
            userShareRepository.delete(share);
            orderRepository.save(Order.builder()
                    .id(orderId).userId(userId).streamerId(channelId).type("sell")
                    .quantity(heldQty).estimatedPrice(fallbackPrice).executedPrice(stock.getCurrentPrice())
                    .orderMode("market").status("completed").createdAt(System.currentTimeMillis())
                    .executedAt(System.currentTimeMillis()).build());
            result[0] = userRepository.findById(userId).orElseThrow().getCoinBalance();
            result[1] = stock.getCurrentPrice();
        });
        evictUserCache(userId);
        return new TradeResponse("executed", result[1].toPlainString(), result[0].toPlainString(),
                "0", orderId, "market");
    }

    private BigDecimal fractionalSellProceeds(BigDecimal fractionalQty, BigDecimal price) {
        if (fractionalQty.compareTo(BigDecimal.ZERO) <= 0) return BigDecimal.ZERO;
        BigInteger gross = fractionalQty.multiply(price).setScale(0, RoundingMode.FLOOR).toBigInteger();
        BigInteger[] fee = AmmCalculator.fee(gross);
        return new BigDecimal(gross.subtract(fee[0]).subtract(fee[1]).max(BigInteger.ZERO));
    }

    public void evictUserCache(String userId) {
        balanceCache.remove(userId);
        sharesCache.remove(userId);
        rankCacheService.evict(userId);
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

    public void runWithStockLock(String channelId, Runnable task) {
        ReentrantLock stockLock = stockLocks.computeIfAbsent(channelId, k -> new ReentrantLock());
        stockLock.lock();
        try {
            task.run();
        } finally {
            stockLock.unlock();
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
        String[] streamerId = new String[1];
        runWithUserLock(userId, () -> {
            newBalance[0] = cancelLimitOrderLocked(userId, orderId, streamerId);
            evictUserCache(userId);
        });

        asyncBroadcast.send("/topic/orders/" + userId,
                Map.of("orderId", orderId, "status", "cancelled"));
        if (streamerId[0] != null) {
            broadcastOrderBookChanged(streamerId[0]);
        }
        return new TradeResponse("cancelled", "0", newBalance[0].toPlainString(), "0", orderId, "limit");
    }

    private BigDecimal cancelLimitOrderLocked(String userId, String orderId, String[] streamerId) {
        return new TransactionTemplate(txManager).execute(status -> {
            Order order = orderRepository.findByIdForUpdate(orderId)
                    .orElseThrow(() -> new IllegalStateException("존재하지 않는 주문입니다."));
            if (!userId.equals(order.getUserId())) {
                throw new IllegalStateException("존재하지 않는 주문입니다.");
            }
            if (!"pending".equals(order.getStatus())) {
                throw new IllegalStateException("이미 처리되었거나 취소된 주문입니다.");
            }

            streamerId[0] = order.getStreamerId();
            BigDecimal refund = BigDecimal.ZERO;
            if ("buy".equals(order.getType())) {
                BigInteger remainingQty = order.remainingQuantity().toBigIntegerExact();
                if (remainingQty.signum() > 0) {
                    refund = limitReservationAmount(order.getLimitPrice(), remainingQty, true);
                }
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
                                             boolean isBuy, BigInteger qty,
                                             BigDecimal fallbackPrice,
                                             boolean processPendingAfterExecution,
                                             BigDecimal maxCoinIn, BigDecimal minCoinOut) {
        AmmCalculator.AmmResult amm = calculateAmmTrade(channelId, isBuy, qty);
        BigDecimal userNet = new BigDecimal(amm.userNetAmount());

        if (isBuy && maxCoinIn != null && userNet.compareTo(maxCoinIn) > 0) {
            throw validationError("가격 변동이 커서 주문이 취소되었습니다. 다시 시도해 주세요. (실제 비용 " + userNet + " > 최대 허용 " + maxCoinIn + ")");
        }
        if (!isBuy && minCoinOut != null && userNet.compareTo(minCoinOut) < 0) {
            throw validationError("가격 변동이 커서 주문이 취소되었습니다. 다시 시도해 주세요. (실제 수령 " + userNet + " < 최소 허용 " + minCoinOut + ")");
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
                savedTrade.poolForCache()[0], savedTrade.poolForCache()[1],
                savedTrade.dailyVolume(), savedTrade.dailyTradingValue(), orderId,
                savedTrade.tradingSuspended(), savedTrade.tradingSuspensionReason());
        if (processPendingAfterExecution) {
            processPendingLimitOrders(channelId);
        }

        return new TradeResponse("executed", amm.newPrice().toPlainString(), newBalance.toPlainString(),
                "0", orderId, "market");
    }

    private TradeResponse submitLimitOrder(String userId, String channelId, boolean isBuy, BigInteger qty,
                                           BigDecimal fallbackPrice, BigDecimal limitPrice, boolean allowPartial) {
        if (limitPrice == null || limitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw validationError("지정가 주문에는 가격을 입력해야 합니다.");
        }

        BigDecimal currentPrice = loadPrice(channelId, fallbackPrice);
        if (isLimitMarketable(currentPrice, isBuy, limitPrice)) {
            return executeImmediateLimitOrder(userId, channelId, isBuy, qty, fallbackPrice, limitPrice, allowPartial);
        }
        return createPendingLimitOrder(userId, channelId, isBuy, qty, fallbackPrice, limitPrice, allowPartial);
    }

    private boolean isLimitMarketable(BigDecimal currentPrice, boolean isBuy, BigDecimal limitPrice) {
        return isBuy
                ? currentPrice.compareTo(limitPrice) <= 0
                : currentPrice.compareTo(limitPrice) >= 0;
    }

        // Check whether current price is within limit; returns null if not yet executable
    private AmmCalculator.AmmResult calcAmmTradeForLimit(String channelId, boolean isBuy, BigInteger qty,
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

    private TradeResponse executeImmediateLimitOrder(String userId, String channelId, boolean isBuy, BigInteger qty,
                                                     BigDecimal fallbackPrice, BigDecimal limitPrice, boolean allowPartial) {
        AmmCalculator.AmmResult amm = calcAmmTradeForLimit(channelId, isBuy, qty, limitPrice);
        if (amm == null) {
            if (!allowPartial) throw validationError("현재 시장가가 지정가보다 많이 벗어났습니다.");
            BigInteger[] pool = loadAmmPool(channelId);
            BigInteger partialQty = findMaxPartialQty(pool[0], pool[1], isBuy, qty, limitPrice);
            if (partialQty.signum() <= 0) {
                return createPendingLimitOrder(userId, channelId, isBuy, qty, fallbackPrice, limitPrice, true);
            }
            amm = calcAmmTradeForLimit(channelId, isBuy, partialQty, limitPrice);
            qty = partialQty;
        }
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
                savedTrade.poolForCache()[0], savedTrade.poolForCache()[1],
                savedTrade.dailyVolume(), savedTrade.dailyTradingValue(), orderId,
                savedTrade.tradingSuspended(), savedTrade.tradingSuspensionReason());
        processPendingLimitOrders(channelId);

        return new TradeResponse("executed", amm.newPrice().toPlainString(), newBalance.toPlainString(), "0", orderId, "limit");
    }

    private TradeResponse createPendingLimitOrder(String userId, String channelId, boolean isBuy, BigInteger qty,
                                                  BigDecimal fallbackPrice, BigDecimal limitPrice, boolean allowPartial) {
        BigDecimal reserveAmount = limitReservationAmount(limitPrice, qty, isBuy);
        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, BigDecimal> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        BigDecimal heldQty = shares.getOrDefault(channelId, BigDecimal.ZERO);

        validateLimitOrder(channelId, userId, isBuy, qty, reserveAmount, currentBalance, heldQty);
        String orderId = UUID.randomUUID().toString();
        BigDecimal newBalance = reservePendingLimitOrder(userId, channelId, isBuy, qty, fallbackPrice, limitPrice,
                reserveAmount, orderId, allowPartial);

        if (isBuy) {
            balanceCache.put(userId, newBalance);
        }
        broadcastOrderBookChanged(channelId);

        return new TradeResponse("pending", "0", newBalance.toPlainString(), "0", orderId, "limit");
    }

    /**
     * Binary search for the largest qty in [1, maxQty] that the AMM can fill within limitPrice.
     * Uses DB-fresh pool reserves to avoid cache staleness.
     * Returns 0 if even 1 unit cannot be filled at the given limit.
     */
    private BigInteger findMaxPartialQty(BigInteger coinReserve, BigInteger shareReserve,
                                   boolean isBuy, BigInteger maxQty, BigDecimal limitPrice) {
        AmmCalculator.AmmResult test = isBuy
                ? AmmCalculator.calcBuy(coinReserve, shareReserve, 1)
                : AmmCalculator.calcSell(coinReserve, shareReserve, 1);
        BigDecimal net1 = new BigDecimal(test.userNetAmount());
        BigDecimal limit1 = limitReservationAmount(limitPrice, BigInteger.ONE, isBuy);
        boolean unit1Ok = isBuy ? net1.compareTo(limit1) <= 0
                                : net1.compareTo(limitPrice) >= 0;
        if (!isBuy && !isPostTradePriceSafe(test)) {
            unit1Ok = false;
        }
        if (!unit1Ok) return BigInteger.ZERO;

        BigInteger lo = BigInteger.ONE;
        BigInteger hi = maxQty;
        while (lo.compareTo(hi) < 0) {
            BigInteger mid = lo.add(hi).add(BigInteger.ONE).divide(BigInteger.TWO);
            AmmCalculator.AmmResult amm = isBuy
                    ? AmmCalculator.calcBuy(coinReserve, shareReserve, mid)
                    : AmmCalculator.calcSell(coinReserve, shareReserve, mid);
            BigDecimal userNet = new BigDecimal(amm.userNetAmount());
            BigDecimal ceiling = limitReservationAmount(limitPrice, mid, isBuy);
            BigDecimal floor = limitPrice.multiply(new BigDecimal(mid));
            boolean ok = isBuy ? userNet.compareTo(ceiling) <= 0
                               : userNet.compareTo(floor) >= 0;
            if (!isBuy && !isPostTradePriceSafe(amm)) {
                ok = false;
            }
            if (ok) lo = mid;
            else hi = mid.subtract(BigInteger.ONE);
        }
        return lo;
    }

    private BigDecimal limitReservationAmount(BigDecimal limitPrice, BigInteger qty, boolean isBuy) {
        BigDecimal gross = limitPrice.multiply(new BigDecimal(qty)).setScale(0, RoundingMode.CEILING);
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

    AmmCalculator.AmmResult calculateAmmTrade(String channelId, boolean isBuy, BigInteger qty) {
        BigInteger[] pool = loadAmmPool(channelId);
        if (pool[0] == null || pool[1] == null || pool[0].signum() <= 0 || pool[1].signum() <= 0) {
            suspendUnsafePriceStock(channelId);
        }
        AmmCalculator.AmmResult amm = isBuy
                ? AmmCalculator.calcBuy(pool[0], pool[1], qty)
                : AmmCalculator.calcSell(pool[0], pool[1], qty);
        validatePostTradePrice(isBuy, amm);
        return amm;
    }

    private void validatePostTradePrice(boolean isBuy, AmmCalculator.AmmResult amm) {
        if (isBuy) {
            return;
        }
        if (!isPostTradePriceSafe(amm)) {
            throw validationError("매도 후 가격이 최소 표시 단위(0.000001원) 미만이 되어 주문이 취소되었습니다. 수량을 줄여주세요.");
        }
    }

    private boolean isPostTradePriceSafe(AmmCalculator.AmmResult amm) {
        return amm.newPrice().compareTo(MIN_STORABLE_PRICE) >= 0;
    }

    private void suspendUnsafePriceStock(String channelId) {
        stockRepository.findById(channelId).ifPresent(stock -> {
            if (!stock.isTradingSuspended()) {
                stock.suspendTrading(SUSPENSION_REASON_INVALID_AMM_POOL);
                stockRepository.save(stock);
            }
        });
        evictStockCache(channelId);
        throw new IllegalStateException("가격 또는 AMM 풀이 비정상인 종목입니다. 액면병합 후 거래가 재개됩니다.");
    }

    private void validateTrade(String userId, String channelId, boolean isBuy, BigInteger qty, BigDecimal cost,
                               BigDecimal currentBalance, BigDecimal heldQty) {
        Stock stock = stockRepository.findById(channelId)
                .orElseThrow(() -> new IllegalStateException("종목 정보를 찾을 수 없습니다."));
        if (stock.isTradingSuspended()) {
            throw validationError("현재 거래가 정지된 종목입니다.");
        }
        if (stock.getCurrentPrice() == null || stock.getCurrentPrice().compareTo(BigDecimal.ZERO) <= 0
                || stock.getCoinReserve() == null || stock.getShareReserve() == null
                || stock.getCoinReserve().signum() <= 0 || stock.getShareReserve().signum() <= 0) {
            stock.suspendTrading(SUSPENSION_REASON_INVALID_AMM_POOL);
            stockRepository.save(stock);
            evictStockCache(channelId);
            throw new IllegalStateException("가격 또는 AMM 풀이 비정상인 종목입니다. 액면병합 후 거래가 재개됩니다.");
        }

        if (!isBuy) {
            BigDecimal pendingSellQty = orderRepository.sumPendingSellQuantity(userId, channelId);
            if (heldQty.subtract(pendingSellQty).compareTo(new BigDecimal(qty)) < 0) {
                throw validationError("보유 수량이 부족합니다.");
            }
            return;
        }

        if (currentBalance.compareTo(cost) < 0) {
            throw validationError("잔고가 부족합니다.");
        }
        boolean isNewListing = stock.getListedAt() != null
                && ChronoUnit.HOURS.between(stock.getListedAt(), LocalDateTime.now(KST)) < AntiWhalePolicy.NEW_LISTING_HOURS;
        if (isNewListing) {
            BigDecimal pendingBuyQty = orderRepository.sumPendingBuyQuantity(userId, channelId);
            if (heldQty.add(pendingBuyQty).add(new BigDecimal(qty))
                    .compareTo(BigDecimal.valueOf(AntiWhalePolicy.NEW_LISTING_CAP)) > 0) {
                throw validationError("신규 상장 초기에는 최대 200주까지 보유 가능합니다.");
            }
        }

    }

    private void validateLimitOrder(String channelId, String userId, boolean isBuy, BigInteger qty, BigDecimal reserveAmount,
                                    BigDecimal currentBalance, BigDecimal heldQty) {
        if (isBuy) {
            validateTrade(userId, channelId, true, qty, reserveAmount, currentBalance, heldQty);
            return;
        }

        BigDecimal pendingSellQty = orderRepository.sumPendingSellQuantity(userId, channelId);
        if (heldQty.subtract(pendingSellQty).compareTo(new BigDecimal(qty)) < 0) {
            throw validationError("보유 수량이 부족합니다.");
        }
    }

    private TradePersistenceResult persistTrade(String userId, String channelId, AmmCalculator.AmmResult amm,
                                                boolean isBuy, BigInteger qty, BigDecimal fallbackPrice, long executedAt,
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
            saveOrder(userId, channelId, isBuy, qty, fallbackPrice, amm.newPrice(), executedAt,
                    orderId, orderMode, limitPrice, "completed");
            return new TradePersistenceResult(stock.getStreamerName(), poolForCache,
                    stock.getDailyVolume(), stock.getDailyTradingValue(),
                    stock.isTradingSuspended(), stock.getTradingSuspensionReason());
        });
    }

    private User getOrCreateUser(String userId) {
        return userRepository.findById(userId)
                .orElseGet(() -> userRepository.save(User.builder().id(userId).coinBalance(INITIAL_BALANCE).build()));
    }

    private BigInteger[] updateStock(Stock stock, boolean isBuy, BigInteger qty, AmmCalculator.AmmResult amm, BigDecimal userNet) {
        stock.applyAmmTrade(amm.newPool()[0], amm.newPool()[1], amm.feePoolAmount());
        stock.applyTrade(amm.newPrice(), isBuy, qty, userNet);
        MarketPrice.syncPriceSuspension(stock);
        stockRepository.save(stock);
        return new BigInteger[]{stock.getCoinReserve(), stock.getShareReserve()};
    }

    private BigDecimal updateUserShareAndCalculateProfit(User user, Stock stock, String channelId, boolean isBuy,
                                                         BigInteger qty, BigDecimal cost) {
        if (isBuy) {
            UserShare share = userShareRepository.findByUserIdAndStockChannelId(user.getId(), channelId)
                    .orElseGet(() -> UserShare.builder()
                            .user(user)
                            .stock(stock)
                            .quantity(BigDecimal.ZERO)
                            .preStreamQuantity(BigDecimal.ZERO)
                            .avgPrice(BigDecimal.ZERO)
                            .build());
            updateBoughtShare(share, qty, cost, stock.isLive());
            return BigDecimal.ZERO;
        } else {
            UserShare share = userShareRepository.findByUserIdAndStockChannelId(user.getId(), channelId)
                    .orElseThrow(() -> new IllegalStateException("보유 수량이 부족합니다."));
            if (share.getQuantity().compareTo(qtyDecimal(qty)) < 0) {
                throw new IllegalStateException("보유 수량이 부족합니다.");
            }
            BigDecimal profit = calculateRealizedProfit(share, qty, cost);
            updateSoldShare(share, qty);
            return profit;
        }
    }

    private void updateBoughtShare(UserShare share, BigInteger qty, BigDecimal cost, boolean isLive) {
        BigDecimal prevQty = share.getQuantity();
        BigDecimal boughtQty = qtyDecimal(qty);
        BigDecimal newQty = prevQty.add(boughtQty);
        BigDecimal prevAvg = share.getAvgPrice() != null ? share.getAvgPrice() : BigDecimal.ZERO;
        BigDecimal newAvg = prevAvg.multiply(prevQty)
                .add(cost)
                .divide(newQty, PRICE_SCALE, RoundingMode.HALF_UP);
        if (isLive) {
            share.updateOnLiveBuy(newQty, newAvg, boughtQty);
        } else {
            share.updateOnBuy(newQty, newAvg);
        }
        userShareRepository.save(share);
    }

    private void updateSoldShare(UserShare share, BigInteger qty) {
        BigDecimal newQty = share.getQuantity().subtract(qtyDecimal(qty));
        if (newQty.compareTo(BigDecimal.ZERO) <= 0) {
            userShareRepository.delete(share);
            return;
        }
        share.updateOnSell(newQty);
        userShareRepository.save(share);
    }

    private BigDecimal calculateRealizedProfit(UserShare share, BigInteger qty, BigDecimal proceeds) {
        BigDecimal avgBuyPrice = share.getAvgPrice() != null ? share.getAvgPrice() : BigDecimal.ZERO;
        BigDecimal costBasis = avgBuyPrice.multiply(qtyDecimal(qty));
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

    private BigDecimal qtyDecimal(BigInteger qty) {
        return new BigDecimal(qty);
    }

    private void saveOrder(String userId, String channelId, boolean isBuy, BigInteger qty,
                           BigDecimal fallbackPrice, BigDecimal executedPrice, long executedAt,
                           String orderId, String orderMode, BigDecimal limitPrice, String orderStatus) {
        orderRepository.save(Order.builder()
                .id(orderId)
                .userId(userId)
                .streamerId(channelId)
                .type(isBuy ? "buy" : "sell")
                .quantity(qtyDecimal(qty))
                .estimatedPrice(fallbackPrice)
                .executedPrice(executedPrice)
                .orderMode(orderMode)
                .limitPrice(limitPrice)
                .status(orderStatus)
                .createdAt(executedAt)
                .executedAt("completed".equals(orderStatus) ? executedAt : null)
                .build());
    }

    private BigDecimal reservePendingLimitOrder(String userId, String channelId, boolean isBuy, BigInteger qty,
                                                BigDecimal fallbackPrice, BigDecimal limitPrice,
                                                BigDecimal reserveAmount, String orderId, boolean allowPartial) {
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
                    .quantity(qtyDecimal(qty))
                    .estimatedPrice(fallbackPrice)
                    .executedPrice(null)
                    .orderMode("limit")
                    .limitPrice(limitPrice)
                    .status("pending")
                    .allowPartial(allowPartial)
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
        BigDecimal[] dailyVolumeHolder = new BigDecimal[1];
        BigDecimal[] dailyTradingValueHolder = new BigDecimal[1];
        boolean[] tradingSuspendedHolder = new boolean[1];
        String[] tradingSuspensionReasonHolder = new String[1];
        new TransactionTemplate(txManager).executeWithoutResult(status -> {
            Order freshOrder = orderRepository.findByIdForUpdate(order.getId()).orElse(null);
            if (freshOrder == null || !"pending".equals(freshOrder.getStatus())) return;

            boolean freshIsBuy = "buy".equals(freshOrder.getType());
            BigInteger remainingQty = freshOrder.remainingQuantity().toBigIntegerExact();
            if (remainingQty.signum() <= 0) return;

            Stock stock = stockRepository.findByIdForUpdate(freshOrder.getStreamerId()).orElseThrow();
            User user = userRepository.findById(freshOrder.getUserId())
                    .orElseThrow(() -> new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요."));

            // Recalculate AMM with DB-fresh reserves for the remaining quantity
            AmmCalculator.AmmResult amm = freshIsBuy
                    ? AmmCalculator.calcBuy(stock.getCoinReserve(), stock.getShareReserve(), remainingQty)
                    : AmmCalculator.calcSell(stock.getCoinReserve(), stock.getShareReserve(), remainingQty);

            BigDecimal userNet = new BigDecimal(amm.userNetAmount());
            BigDecimal limitFloor = freshOrder.getLimitPrice().multiply(new BigDecimal(remainingQty));
            BigDecimal limitCeiling = limitReservationAmount(freshOrder.getLimitPrice(), remainingQty, true);

            boolean fullFillOk = freshIsBuy
                    ? userNet.compareTo(limitCeiling) <= 0
                    : userNet.compareTo(limitFloor) >= 0;
            if (!freshIsBuy && !isPostTradePriceSafe(amm)) {
                fullFillOk = false;
            }

            BigInteger fillQty = remainingQty;
            if (!fullFillOk) {
                if (!freshOrder.isAllowPartial()) return;
                fillQty = findMaxPartialQty(stock.getCoinReserve(), stock.getShareReserve(),
                        freshIsBuy, remainingQty, freshOrder.getLimitPrice());
                if (fillQty.signum() <= 0) return;
                amm = freshIsBuy
                        ? AmmCalculator.calcBuy(stock.getCoinReserve(), stock.getShareReserve(), fillQty)
                        : AmmCalculator.calcSell(stock.getCoinReserve(), stock.getShareReserve(), fillQty);
                userNet = new BigDecimal(amm.userNetAmount());
                if (!freshIsBuy && !isPostTradePriceSafe(amm)) return;
            }

            if (freshIsBuy) {
                if (stock.getTotalSupply().compareTo(BigDecimal.ZERO) > 0
                        && stock.getIssuedShares().add(qtyDecimal(fillQty)).compareTo(stock.getTotalSupply()) > 0) {
                    BigDecimal refund = limitReservationAmount(freshOrder.getLimitPrice(), remainingQty, true);
                    freshOrder.cancel();
                    orderRepository.save(freshOrder);
                    addToUserBalance(freshOrder.getUserId(), refund);
                    return;
                }
                BigDecimal reservedForFill = limitReservationAmount(freshOrder.getLimitPrice(), fillQty, true);
                BigDecimal refund = reservedForFill.subtract(userNet).max(BigDecimal.ZERO);
                updateUserShareAndCalculateProfit(user, stock, freshOrder.getStreamerId(), true, fillQty, userNet);
                if (refund.compareTo(BigDecimal.ZERO) > 0) {
                    addToUserBalance(user.getId(), refund);
                }
            } else {
                UserShare share = userShareRepository.findByUserIdAndStockChannelId(
                        user.getId(), freshOrder.getStreamerId()).orElse(null);
                if (share == null || share.getQuantity().compareTo(qtyDecimal(fillQty)) < 0) {
                    freshOrder.cancel();
                    orderRepository.save(freshOrder);
                    return;
                }
                BigDecimal profit = calculateRealizedProfit(share, fillQty, userNet);
                updateSoldShare(share, fillQty);
                addToUserBalance(user.getId(), userNet);
                addToUserRealizedProfit(user.getId(), profit);
            }

            poolHolder[0] = updateStock(stock, freshIsBuy, fillQty, amm, userNet);
            dailyVolumeHolder[0] = stock.getDailyVolume();
            dailyTradingValueHolder[0] = stock.getDailyTradingValue();
            tradingSuspendedHolder[0] = stock.isTradingSuspended();
            tradingSuspensionReasonHolder[0] = stock.getTradingSuspensionReason();
            if (fillQty.compareTo(remainingQty) >= 0) {
                freshOrder.complete(amm.newPrice(), executedAt);
            } else {
                freshOrder.partialFill(qtyDecimal(fillQty), amm.newPrice(), executedAt);
            }
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
        BigInteger broadcastQty = order.getQuantity().toBigIntegerExact(); // use original; exact fill qty not available outside tx
        broadcastTrade(order.getStreamerId(), streamerName, isBuy, broadcastQty, amm.newPrice(), executedAt,
                new BigDecimal(amm.userNetAmount()), poolForCache[0], poolForCache[1],
                dailyVolumeHolder[0], dailyTradingValueHolder[0], order.getId(),
                tradingSuspendedHolder[0], tradingSuspensionReasonHolder[0]);
        asyncBroadcast.send("/topic/orders/" + order.getUserId(),
                Map.of("orderId", order.getId(), "status", "completed"));
    }

    private BigDecimal updateCaches(String userId, String channelId, boolean isBuy, BigInteger qty,
                                    AmmCalculator.AmmResult amm, BigInteger[] poolForCache, BigDecimal currentBalance,
                                    Map<String, BigDecimal> shares, BigDecimal heldQty) {
        ammPoolCache.put(channelId, poolForCache);
        priceCache.put(channelId, amm.newPrice());

        BigDecimal userNet = new BigDecimal(amm.userNetAmount());
        BigDecimal newBalance = isBuy
                ? currentBalance.subtract(userNet)
                : currentBalance.add(userNet);
        balanceCache.put(userId, newBalance);

        shares.put(channelId, isBuy ? heldQty.add(qtyDecimal(qty)) : heldQty.subtract(qtyDecimal(qty)));
        return newBalance;
    }

    private record TradePersistenceResult(String streamerName, BigInteger[] poolForCache,
                                          BigDecimal dailyVolume, BigDecimal dailyTradingValue,
                                          BigDecimal fractionalProceeds, boolean tradingSuspended,
                                          String tradingSuspensionReason) {
        private TradePersistenceResult(String streamerName, BigInteger[] poolForCache,
                                       BigDecimal dailyVolume, BigDecimal dailyTradingValue) {
            this(streamerName, poolForCache, dailyVolume, dailyTradingValue, BigDecimal.ZERO, false, null);
        }
        private TradePersistenceResult(String streamerName, BigInteger[] poolForCache,
                                       BigDecimal dailyVolume, BigDecimal dailyTradingValue,
                                       boolean tradingSuspended) {
            this(streamerName, poolForCache, dailyVolume, dailyTradingValue, BigDecimal.ZERO, tradingSuspended, null);
        }
        private TradePersistenceResult(String streamerName, BigInteger[] poolForCache,
                                       BigDecimal dailyVolume, BigDecimal dailyTradingValue,
                                       boolean tradingSuspended, String tradingSuspensionReason) {
            this(streamerName, poolForCache, dailyVolume, dailyTradingValue, BigDecimal.ZERO,
                    tradingSuspended, tradingSuspensionReason);
        }
    }

    // Issue #18: candleService.onTrade瑜?鍮꾨룞湲??몄텧??stockLock 蹂댁쑀 ?곹깭?먯꽌??紐⑤땲????以묒꺽 ?쒓굅
    private void broadcastTrade(String channelId, String streamerName, boolean isBuy, BigInteger qty,
                                BigDecimal executedPrice, long executedAt, BigDecimal cost,
                                BigInteger coinReserve, BigInteger shareReserve,
                                BigDecimal dailyVolume, BigDecimal dailyTradingValue, String orderId,
                                boolean tradingSuspended, String tradingSuspensionReason) {
        BigDecimal displayPrice = MarketPrice.spotPrice(coinReserve, shareReserve, executedPrice);
        CompletableFuture.runAsync(() -> candleService.onTrade(channelId, displayPrice, executedAt), candleExecutor);
        asyncBroadcast.send("/topic/prices/" + channelId,
                Map.of("streamerId", channelId, "price", displayPrice.toPlainString()));
        broadcastOrderBookChanged(channelId);
        Map<String, Object> tradePayload = new LinkedHashMap<>();
        tradePayload.put("id", orderId);
        tradePayload.put("streamerId", channelId);
        tradePayload.put("streamerName", streamerName != null ? streamerName : channelId);
        tradePayload.put("type", isBuy ? "buy" : "sell");
        tradePayload.put("quantity", qty.toString());
        tradePayload.put("price", displayPrice.toPlainString());
        tradePayload.put("tradingValue", toLongCap(cost));
        tradePayload.put("dailyVolume", dailyVolume != null ? dailyVolume.toPlainString() : qty.toString());
        tradePayload.put("dailyTradingValue", dailyTradingValue != null ? dailyTradingValue.toPlainString() : cost.abs().toPlainString());
        tradePayload.put("coinReserve", coinReserve.toString());
        tradePayload.put("shareReserve", shareReserve.toString());
        tradePayload.put("timestamp", executedAt);
        tradePayload.put("tradingSuspended", tradingSuspended);
        tradePayload.put("tradingSuspensionReason", tradingSuspensionReason);
        asyncBroadcast.send("/topic/trades", tradePayload);
    }

    private void broadcastOrderBookChanged(String channelId) {
        asyncBroadcast.send("/topic/order-book/" + channelId, Map.of("streamerId", channelId));
    }

    private TradeValidationException validationError(String message) {
        return new TradeValidationException(message);
    }

    private static final class TradeValidationException extends IllegalStateException {
        private TradeValidationException(String message) {
            super(message);
        }
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
    private void recordTradeFailure(TradeRequest req, String reason) {
        try {
            log.warn("[TRADE_FAILURE] userId={} streamerId={} type={} qty={} price={} orderMode={} reason={}",
                    req.getUserId(), req.getStreamerId(), req.getType(),
                    req.getQuantity(), req.getEstimatedPrice(), req.getOrderMode(), reason);
            new TransactionTemplate(txManager).executeWithoutResult(status ->
                    tradeFailureLogRepository.save(TradeFailureLog.builder()
                            .userId(req.getUserId())
                            .streamerId(req.getStreamerId())
                            .type(req.getType())
                            .quantity(req.getQuantity() != null ? new BigDecimal(req.getQuantity()) : null)
                            .price(req.getEstimatedPrice())
                            .orderMode(req.getOrderMode())
                            .reason(reason != null ? reason : "unknown")
                            .failedAt(System.currentTimeMillis())
                            .build())
            );
        } catch (Exception ex) {
            log.error("[TRADE_FAILURE] Failed to persist trade failure log: {}", ex.getMessage());
        }
    }

    @Scheduled(fixedDelay = 300_000)
    public void cleanupIdleLocks() {
        // ReentrantLock removal has a TOCTOU race: a thread can obtain the old lock while
        // another thread removes it, allowing a later request to create a second lock.
        // Keep lock identities stable for correctness.
    }
}


