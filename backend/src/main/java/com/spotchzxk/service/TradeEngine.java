package com.spotchzxk.service;

import com.spotchzxk.dto.TradeRequest;
import com.spotchzxk.dto.TradeResponse;
import com.spotchzxk.entity.Order;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.entity.User;
import com.spotchzxk.entity.UserShare;
import com.spotchzxk.policy.AntiWhalePolicy;
import com.spotchzxk.repository.OrderRepository;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserRepository;
import com.spotchzxk.repository.UserShareRepository;
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

    private TradeResponse executeMarketOrder(String userId, String channelId,
                                             boolean isBuy, int qty,
                                             BigDecimal fallbackPrice) {
        BigDecimal currentPrice = loadPrice(channelId, fallbackPrice);
        BigDecimal executedPrice = calculateExecutedPrice(currentPrice, isBuy, qty);
        BigDecimal cost = executedPrice.multiply(BigDecimal.valueOf(qty));
        long executedAt = System.currentTimeMillis();

        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, Long> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        long heldQty = shares.getOrDefault(channelId, 0L);

        validateTrade(channelId, isBuy, qty, cost, currentBalance, heldQty);
        String streamerName = persistTrade(userId, channelId, isBuy, qty, fallbackPrice, executedPrice, cost, executedAt);
        BigDecimal newBalance = updateCaches(userId, channelId, isBuy, qty, executedPrice,
                currentBalance, shares, heldQty, cost);
        broadcastTrade(channelId, streamerName, isBuy, qty, executedPrice, executedAt);

        return new TradeResponse("executed", executedPrice, newBalance,
                BigDecimal.ZERO, UUID.randomUUID().toString(), "market");
    }

    private BigDecimal loadPrice(String channelId, BigDecimal fallbackPrice) {
        return priceCache.computeIfAbsent(channelId, k ->
                stockRepository.findById(k)
                        .map(stock -> BigDecimal.valueOf(stock.getCurrentPrice()))
                        .orElse(fallbackPrice));
    }

    private BigDecimal calculateExecutedPrice(BigDecimal currentPrice, boolean isBuy, int qty) {
        double rate = isBuy ? (1.0 + PRICE_IMPACT_PER_SHARE) : (1.0 - PRICE_IMPACT_PER_SHARE);
        double finalPriceRaw = currentPrice.doubleValue() * Math.pow(rate, qty);
        return BigDecimal.valueOf(Math.max(1.0, finalPriceRaw))
                .setScale(0, RoundingMode.HALF_UP);
    }

    private void validateTrade(String channelId, boolean isBuy, int qty, BigDecimal cost,
                               BigDecimal currentBalance, long heldQty) {
        if (!isBuy) {
            if (heldQty < qty) {
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
        long holdingLimit = isNewListing ? AntiWhalePolicy.NEW_LISTING_CAP : AntiWhalePolicy.MAX_HOLDING;
        if (heldQty + qty > holdingLimit) {
            throw new IllegalStateException(isNewListing
                    ? "신규 상장 초기 최대 200개까지 매수 가능합니다."
                    : "종목당 최대 1,000개까지 보유 가능합니다.");
        }

        if (stock.getTotalSupply() > 0 && stock.getIssuedShares() + qty > stock.getTotalSupply()) {
            throw new IllegalStateException("Issued share limit exceeded.");
        }
    }

    private String persistTrade(String userId, String channelId, boolean isBuy, int qty,
                                BigDecimal fallbackPrice, BigDecimal executedPrice, BigDecimal cost, long executedAt) {
        return new TransactionTemplate(txManager).execute(status -> {
            Stock stock = stockRepository.findById(channelId).orElseThrow();
            User user = userRepository.findById(userId)
                    .orElse(User.builder().id(userId).coinBalance(INITIAL_BALANCE).build());

            updateStock(stock, isBuy, qty, executedPrice);
            updateUserBalance(user, isBuy, cost);
            updateUserShare(user, stock, channelId, isBuy, qty, cost);
            saveOrder(userId, channelId, isBuy, qty, fallbackPrice, executedPrice, executedAt);
            return stock.getStreamerName();
        });
    }

    private void updateStock(Stock stock, boolean isBuy, int qty, BigDecimal executedPrice) {
        stock.applyTrade(executedPrice.intValue(), isBuy, qty);
        stockRepository.save(stock);
    }

    private void updateUserBalance(User user, boolean isBuy, BigDecimal cost) {
        BigDecimal newBalance = isBuy
                ? user.getCoinBalance().subtract(cost)
                : user.getCoinBalance().add(cost);
        user.updateBalance(newBalance);
        userRepository.save(user);
    }

    private void updateUserShare(User user, Stock stock, String channelId, boolean isBuy,
                                 int qty, BigDecimal cost) {
        UserShare share = userShareRepository.findByUserIdAndStockChannelId(user.getId(), channelId)
                .orElseGet(() -> UserShare.builder()
                        .user(user)
                        .stock(stock)
                        .quantity(0L)
                        .avgPrice(BigDecimal.ZERO)
                        .build());

        if (isBuy) {
            updateBoughtShare(share, qty, cost);
        } else {
            updateRealizedProfit(user, share, qty, cost);
            updateSoldShare(share, qty);
        }
    }

    private void updateBoughtShare(UserShare share, int qty, BigDecimal cost) {
        long prevQty = share.getQuantity();
        long newQty = prevQty + qty;
        BigDecimal prevAvg = share.getAvgPrice() != null ? share.getAvgPrice() : BigDecimal.ZERO;
        BigDecimal newAvg = prevAvg.multiply(BigDecimal.valueOf(prevQty))
                .add(cost)
                .divide(BigDecimal.valueOf(newQty), 2, RoundingMode.HALF_UP);
        share.updateOnBuy(newQty, newAvg);
        userShareRepository.save(share);
    }

    private void updateSoldShare(UserShare share, int qty) {
        long newQty = share.getQuantity() - qty;
        if (newQty <= 0) {
            userShareRepository.delete(share);
            return;
        }
        share.updateOnSell(newQty);
        userShareRepository.save(share);
    }

    private void updateRealizedProfit(User user, UserShare share, int qty, BigDecimal proceeds) {
        BigDecimal avgBuyPrice = share.getAvgPrice() != null ? share.getAvgPrice() : BigDecimal.ZERO;
        BigDecimal costBasis = avgBuyPrice.multiply(BigDecimal.valueOf(qty));
        BigDecimal profit = proceeds.subtract(costBasis).setScale(2, RoundingMode.HALF_UP);
        BigDecimal currentProfit = user.getRealizedProfit() != null ? user.getRealizedProfit() : BigDecimal.ZERO;
        user.updateRealizedProfit(currentProfit.add(profit));
        userRepository.save(user);
    }

    private void saveOrder(String userId, String channelId, boolean isBuy, int qty,
                           BigDecimal fallbackPrice, BigDecimal executedPrice, long executedAt) {
        orderRepository.save(Order.builder()
                .id(UUID.randomUUID().toString())
                .userId(userId)
                .streamerId(channelId)
                .type(isBuy ? "buy" : "sell")
                .quantity(qty)
                .estimatedPrice(fallbackPrice)
                .executedPrice(executedPrice)
                .orderMode("market")
                .status("completed")
                .createdAt(executedAt)
                .build());
    }

    private BigDecimal updateCaches(String userId, String channelId, boolean isBuy, int qty,
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

    private void broadcastTrade(String channelId, String streamerName, boolean isBuy, int qty,
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
}
