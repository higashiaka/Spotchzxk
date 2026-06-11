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

    // Issue #4: 珥덇린 ?붿븸 10,000,000?먯쑝濡??섏젙 (湲곗〈 1,000,000? 寃뚯엫 寃쎌젣 ?뚭눼 ?섏?)
    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(10_000_000);

    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final StockRepository stockRepository;
    private final OrderRepository orderRepository;
    private final AsyncBroadcastService asyncBroadcast;
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
                try {
                    if ("limit".equals(req.getOrderMode())) {
                        return submitLimitOrder(userId, channelId, isBuy, qty, req.getEstimatedPrice(), req.getLimitPrice());
                    }
                    // Issue #5: ?щ━?쇱? 蹂댄샇 ?뚮씪誘명꽣瑜?executeMarketOrder???꾨떖
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
                throw new IllegalStateException("?대? 泥닿껐?섏뿀嫄곕굹 痍⑥냼??二쇰Ц?낅땲??");
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
                    .orElseThrow(() -> new IllegalStateException("?ъ슜???뺣낫瑜?李얠쓣 ???놁뒿?덈떎. ?ㅼ떆 濡쒓렇?명빐二쇱꽭??"));
        });
    }

    // Issue #5: maxCoinIn/minCoinOut ?뚮씪誘명꽣 異붽?濡??щ━?쇱? 蹂댄샇 援ы쁽
    // Issue #1: orderId瑜?誘몃━ ?앹꽦??persistTrade? ?묐떟?먯꽌 ?숈씪 ID ?ъ슜 (湲곗〈?먮뒗 2媛쒖쓽 UUID媛 ?앹꽦??
    private TradeResponse executeMarketOrder(String userId, String channelId,
                                             boolean isBuy, long qty,
                                             BigDecimal fallbackPrice,
                                             boolean processPendingAfterExecution,
                                             Long maxCoinIn, Long minCoinOut) {
        AmmCalculator.AmmResult amm = calculateAmmTrade(channelId, isBuy, qty);
        long userNetAmount = amm.userNetAmount();

        if (isBuy && maxCoinIn != null && userNetAmount > maxCoinIn) {
            throw new IllegalStateException("슬리피지 초과: 실제 비용 " + userNetAmount + " > 최대허용 " + maxCoinIn);
        }
        if (!isBuy && minCoinOut != null && userNetAmount < minCoinOut) {
            throw new IllegalStateException("슬리피지 초과: 실제 수령 " + userNetAmount + " < 최소허용 " + minCoinOut);
        }

        BigDecimal userNet = BigDecimal.valueOf(userNetAmount);
        long executedAt = System.currentTimeMillis();

        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, Long> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        long heldQty = shares.getOrDefault(channelId, 0L);

        validateTrade(userId, channelId, isBuy, qty, isBuy ? userNet : BigDecimal.ZERO, currentBalance, heldQty);

        String orderId = UUID.randomUUID().toString();
        TradePersistenceResult savedTrade = persistTrade(userId, channelId, amm, isBuy, qty, fallbackPrice, executedAt, orderId, "market", null);
        BigDecimal newBalance = updateCaches(userId, channelId, isBuy, qty, amm, savedTrade.poolForCache(), currentBalance, shares, heldQty);
        broadcastTrade(channelId, savedTrade.streamerName(), isBuy, qty, amm.newPrice(), executedAt, userNet,
                savedTrade.poolForCache()[0], savedTrade.poolForCache()[1]);
        if (processPendingAfterExecution) {
            processPendingLimitOrders(channelId);
        }

        return new TradeResponse("executed", amm.avgPrice(), newBalance,
                BigDecimal.ZERO, orderId, "market");
    }

    private TradeResponse submitLimitOrder(String userId, String channelId, boolean isBuy, long qty,
                                           BigDecimal fallbackPrice, BigDecimal limitPrice) {
        if (limitPrice == null || limitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalStateException("吏?뺢? 二쇰Ц?먮뒗 媛寃⑹쓣 ?낅젰?댁빞 ?⑸땲??");
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

    // 吏?뺢? 泥닿껐 媛???щ? ?뺤씤 + AMM 怨꾩궛. ?щ━?쇱?媛 ?덉빟湲?珥덇낵?섎㈃ null 諛섑솚.
    private AmmCalculator.AmmResult calcAmmTradeForLimit(String channelId, boolean isBuy, long qty,
                                                          BigDecimal limitPrice) {
        AmmCalculator.AmmResult amm = calculateAmmTrade(channelId, isBuy, qty);
        BigDecimal reservation = limitReservationAmount(limitPrice, qty, isBuy);
        BigDecimal userNetAmount = BigDecimal.valueOf(amm.userNetAmount());

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
        if (amm == null) throw new IllegalStateException("?꾩옱 ?쒖옣媛媛 吏?뺢?蹂대떎 ?믪븘 泥닿껐?????놁뒿?덈떎.");
        BigDecimal userNet = BigDecimal.valueOf(amm.userNetAmount());
        long executedAt = System.currentTimeMillis();

        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, Long> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        long heldQty = shares.getOrDefault(channelId, 0L);

        validateTrade(userId, channelId, isBuy, qty, isBuy ? userNet : BigDecimal.ZERO, currentBalance, heldQty);
        String orderId = UUID.randomUUID().toString();
        TradePersistenceResult savedTrade = persistTrade(userId, channelId, amm, isBuy, qty, fallbackPrice,
                executedAt, orderId, "limit", limitPrice);
        BigDecimal newBalance = updateCaches(userId, channelId, isBuy, qty, amm, savedTrade.poolForCache(), currentBalance, shares, heldQty);
        broadcastTrade(channelId, savedTrade.streamerName(), isBuy, qty, amm.newPrice(), executedAt, userNet,
                savedTrade.poolForCache()[0], savedTrade.poolForCache()[1]);
        processPendingLimitOrders(channelId);

        return new TradeResponse("executed", amm.avgPrice(), newBalance, BigDecimal.ZERO, orderId, "limit");
    }

    private TradeResponse createPendingLimitOrder(String userId, String channelId, boolean isBuy, long qty,
                                                  BigDecimal fallbackPrice, BigDecimal limitPrice) {
        BigDecimal reserveAmount = limitReservationAmount(limitPrice, qty, isBuy);
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

    private BigDecimal limitReservationAmount(BigDecimal limitPrice, long qty, boolean isBuy) {
        BigDecimal gross = limitPrice.multiply(BigDecimal.valueOf(qty)).setScale(0, RoundingMode.CEILING);
        long grossAmount = gross.longValueExact();
        long[] fee = AmmCalculator.fee(grossAmount);
        long totalFee = fee[0] + fee[1];
        return BigDecimal.valueOf(isBuy ? grossAmount + totalFee : Math.max(0L, grossAmount - totalFee));
    }

    private BigDecimal loadPrice(String channelId, BigDecimal fallbackPrice) {
        long[] pool = loadAmmPool(channelId);
        return AmmCalculator.price(pool[0], pool[1]);
    }

    private long[] loadAmmPool(String channelId) {
        return ammPoolCache.computeIfAbsent(channelId, k ->
                stockRepository.findById(k)
                        .map(s -> new long[]{s.getCoinReserve(), s.getShareReserve()})
                        .orElseThrow(() -> new IllegalStateException("醫낅ぉ ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎.")));
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
                throw new IllegalStateException("蹂댁쑀 二쇱떇??遺議깊빀?덈떎.");
            }
            return;
        }

        if (currentBalance.compareTo(cost) < 0) {
            throw new IllegalStateException("?붽퀬媛 遺議깊빀?덈떎.");
        }

        Stock stock = stockRepository.findById(channelId)
                .orElseThrow(() -> new IllegalStateException("醫낅ぉ ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎."));
        boolean isNewListing = stock.getListedAt() != null
                && ChronoUnit.HOURS.between(stock.getListedAt(), LocalDateTime.now()) < AntiWhalePolicy.NEW_LISTING_HOURS;
        if (isNewListing) {
            long pendingBuyQty = orderRepository.sumPendingBuyQuantity(userId, channelId);
            if (heldQty + pendingBuyQty + qty > AntiWhalePolicy.NEW_LISTING_CAP) {
                throw new IllegalStateException("?좉퇋 ?곸옣 珥덇린 理쒕? 200媛쒓퉴吏 留ㅼ닔 媛?ν빀?덈떎.");
            }
        }

        if (stock.getTotalSupply() > 0 && stock.getIssuedShares() + qty > stock.getTotalSupply()) {
            throw new IllegalStateException("?대떦 醫낅ぉ??理쒕? 諛쒗뻾 ?쒕룄???꾨떖?덉뒿?덈떎.");
        }
    }

    private void validateLimitOrder(String channelId, String userId, boolean isBuy, long qty, BigDecimal reserveAmount,
                                    BigDecimal currentBalance, long heldQty) {
        if (isBuy) {
            validateTrade(userId, channelId, true, qty, reserveAmount, currentBalance, heldQty);
            Stock stock = stockRepository.findById(channelId)
                    .orElseThrow(() -> new IllegalStateException("醫낅ぉ ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎."));
            long pendingBuyQty = orderRepository.sumPendingBuyQuantityByStreamerId(channelId);
            if (stock.getTotalSupply() > 0 && stock.getIssuedShares() + pendingBuyQty + qty > stock.getTotalSupply()) {
                throw new IllegalStateException("?대떦 醫낅ぉ??理쒕? 諛쒗뻾 ?쒕룄???꾨떖?덉뒿?덈떎.");
            }
            return;
        }

        long pendingSellQty = orderRepository.sumPendingSellQuantity(userId, channelId);
        if (heldQty - pendingSellQty < qty) {
            throw new IllegalStateException("蹂댁쑀 二쇱떇??遺議깊빀?덈떎.");
        }
    }

    private TradePersistenceResult persistTrade(String userId, String channelId, AmmCalculator.AmmResult amm,
                                                boolean isBuy, long qty, BigDecimal fallbackPrice, long executedAt,
                                                String orderId, String orderMode, BigDecimal limitPrice) {
        BigDecimal userNet = BigDecimal.valueOf(amm.userNetAmount());
        return new TransactionTemplate(txManager).execute(status -> {
            Stock stock = stockRepository.findById(channelId)
                    .orElseThrow(() -> new IllegalStateException("醫낅ぉ ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎."));
            User user = getOrCreateUser(userId);

            long[] poolForCache = updateStock(stock, isBuy, qty, amm, userNet);
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

    private long[] updateStock(Stock stock, boolean isBuy, long qty, AmmCalculator.AmmResult amm, BigDecimal userNet) {
        stock.applyAmmTrade(amm.newPool()[0], amm.newPool()[1], amm.feePoolAmount());
        stock.applyTrade(amm.newPrice().longValue(), isBuy, qty, userNet.longValue());
        long targetReserve = AmmMigrationService.calcTierShareReserve(stock.getFollowerCount());
        if (stock.rebalancePoolIfNeeded(targetReserve)) {
            ammPoolCache.remove(stock.getChannelId());
        }
        stockRepository.save(stock);
        return new long[]{stock.getCoinReserve(), stock.getShareReserve()};
    }

    private BigDecimal updateUserShareAndCalculateProfit(User user, Stock stock, String channelId, boolean isBuy,
                                                         long qty, BigDecimal cost) {
        if (isBuy) {
            UserShare share = userShareRepository.findByUserIdAndStockChannelId(user.getId(), channelId)
                    .orElseGet(() -> UserShare.builder()
                            .user(user)
                            .stock(stock)
                            .quantity(0L)
                            .avgPrice(BigDecimal.ZERO)
                            .build());
            updateBoughtShare(share, qty, cost);
            return BigDecimal.ZERO;
        } else {
            UserShare share = userShareRepository.findByUserIdAndStockChannelId(user.getId(), channelId)
                    .orElseThrow(() -> new IllegalStateException("蹂댁쑀 二쇱떇??遺議깊빀?덈떎."));
            if (share.getQuantity() < qty) {
                throw new IllegalStateException("蹂댁쑀 二쇱떇??遺議깊빀?덈떎.");
            }
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
            throw new IllegalStateException("?ъ슜???뺣낫瑜?李얠쓣 ???놁뒿?덈떎. ?ㅼ떆 濡쒓렇?명빐二쇱꽭??");
        }
    }

    private void addToUserRealizedProfit(String userId, BigDecimal delta) {
        if (delta.compareTo(BigDecimal.ZERO) == 0) {
            return;
        }
        if (userRepository.addToRealizedProfit(userId, delta) != 1) {
            throw new IllegalStateException("?ъ슜???뺣낫瑜?李얠쓣 ???놁뒿?덈떎. ?ㅼ떆 濡쒓렇?명빐二쇱꽭??");
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
                    .orElseThrow(() -> new IllegalStateException("?ъ슜???뺣낫瑜?李얠쓣 ???놁뒿?덈떎. ?ㅼ떆 濡쒓렇?명빐二쇱꽭??"));
            if (isBuy) {
                newBalance = newBalance.subtract(reserveAmount);
                if (newBalance.compareTo(BigDecimal.ZERO) < 0) {
                    throw new IllegalStateException("?붽퀬媛 遺議깊빀?덈떎.");
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

    // Issue #11: 媛?二쇰Ц 泥닿껐 ?ъ씠??理쒖떊 AMM 媛寃?濡쒕뱶 (罹먯떆???댁쟾 泥닿껐 吏곹썑 媛깆떊??
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

    // Issue #2: AMM 怨꾩궛???몃옖??뀡 ?대??먯꽌 DB-fresh ? 湲곗??쇰줈 ?섑뻾 (湲곗〈 罹먯떆 湲곕컲 ?몃? 怨꾩궛? race condition ?좊컻)
    private void executePendingLimitOrder(Order order) {
        boolean isBuy = "buy".equals(order.getType());
        long executedAt = System.currentTimeMillis();

        AmmCalculator.AmmResult[] resultHolder = new AmmCalculator.AmmResult[1];
        long[][] poolHolder = new long[1][];
        new TransactionTemplate(txManager).executeWithoutResult(status -> {
            Order freshOrder = orderRepository.findByIdForUpdate(order.getId()).orElse(null);
            if (freshOrder == null || !"pending".equals(freshOrder.getStatus())) return;

            boolean freshIsBuy = "buy".equals(freshOrder.getType());
            Stock stock = stockRepository.findById(freshOrder.getStreamerId()).orElseThrow();
            User user = userRepository.findById(freshOrder.getUserId())
                    .orElseThrow(() -> new IllegalStateException("?ъ슜???뺣낫瑜?李얠쓣 ???놁뒿?덈떎. ?ㅼ떆 濡쒓렇?명빐二쇱꽭??"));

            // DB-fresh ?濡?AMM ?ш퀎??(罹먯떆? DB ?ъ씠 ?ㅻⅨ ?ㅻ젅??嫄곕옒濡?????щ씪吏????덉쓬)
            AmmCalculator.AmmResult amm = freshIsBuy
                    ? AmmCalculator.calcBuy(stock.getCoinReserve(), stock.getShareReserve(), freshOrder.getQuantity())
                    : AmmCalculator.calcSell(stock.getCoinReserve(), stock.getShareReserve(), freshOrder.getQuantity());

            BigDecimal userNet = BigDecimal.valueOf(amm.userNetAmount());
            BigDecimal reservation = freshOrder.getLimitPrice().multiply(BigDecimal.valueOf(freshOrder.getQuantity()));

            // ?ш퀎?????щ━?쇱? ?ы솗??            if (freshIsBuy && userNet.compareTo(reservation) > 0) return;
            if (!freshIsBuy && userNet.compareTo(reservation) < 0) return;

            if (freshIsBuy) {
                if (stock.getTotalSupply() > 0
                        && stock.getIssuedShares() + freshOrder.getQuantity() > stock.getTotalSupply()) {
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
        long[] poolForCache = poolHolder[0] != null ? poolHolder[0] : amm.newPool();
        ammPoolCache.put(order.getStreamerId(), poolForCache);
        priceCache.put(order.getStreamerId(), amm.newPrice());
        evictUserCache(order.getUserId());
        String streamerName = stockRepository.findById(order.getStreamerId())
                .map(Stock::getStreamerName)
                .orElse(order.getStreamerId());
        broadcastTrade(order.getStreamerId(), streamerName, isBuy, order.getQuantity(), amm.newPrice(), executedAt,
                BigDecimal.valueOf(amm.userNetAmount()), poolForCache[0], poolForCache[1]);
        asyncBroadcast.send("/topic/orders/" + order.getUserId(),
                Map.of("orderId", order.getId(), "status", "completed"));
    }

    private BigDecimal updateCaches(String userId, String channelId, boolean isBuy, long qty,
                                    AmmCalculator.AmmResult amm, long[] poolForCache, BigDecimal currentBalance,
                                    Map<String, Long> shares, long heldQty) {
        ammPoolCache.put(channelId, poolForCache);
        priceCache.put(channelId, amm.newPrice());

        BigDecimal userNet = BigDecimal.valueOf(amm.userNetAmount());
        BigDecimal newBalance = isBuy
                ? currentBalance.subtract(userNet)
                : currentBalance.add(userNet);
        balanceCache.put(userId, newBalance);

        shares.put(channelId, isBuy ? heldQty + qty : heldQty - qty);
        return newBalance;
    }

    private record TradePersistenceResult(String streamerName, long[] poolForCache) {
    }

    // Issue #18: candleService.onTrade瑜?鍮꾨룞湲??몄텧??stockLock 蹂댁쑀 ?곹깭?먯꽌??紐⑤땲????以묒꺽 ?쒓굅
    private void broadcastTrade(String channelId, String streamerName, boolean isBuy, long qty,
                                BigDecimal executedPrice, long executedAt, BigDecimal cost,
                                long coinReserve, long shareReserve) {
        CompletableFuture.runAsync(() -> candleService.onTrade(channelId, executedPrice, executedAt));
        asyncBroadcast.send("/topic/prices/" + channelId,
                Map.of("streamerId", channelId, "price", executedPrice));
        asyncBroadcast.send("/topic/trades", Map.of(
                "streamerId", channelId,
                "streamerName", streamerName != null ? streamerName : channelId,
                "type", isBuy ? "buy" : "sell",
                "quantity", qty,
                "price", executedPrice,
                "tradingValue", cost.longValue(),
                "coinReserve", coinReserve,
                "shareReserve", shareReserve,
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

    // Issue #17: ?κ린 ?댁쁺 ??userLocks/stockLocks 留?臾댄븳 利앷? 諛⑹? ??誘몄궗?????뺢린 ?쒓굅
    @Scheduled(fixedDelay = 300_000)
    public void cleanupIdleLocks() {
        userLocks.entrySet().removeIf(e -> !e.getValue().isLocked() && e.getValue().getQueueLength() == 0);
        stockLocks.entrySet().removeIf(e -> !e.getValue().isLocked() && e.getValue().getQueueLength() == 0);
    }
}


