package com.spotchzxk.service.bot;

import com.spotchzxk.dto.TradeRequest;
import com.spotchzxk.entity.Order;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.entity.User;
import com.spotchzxk.entity.UserShare;
import com.spotchzxk.repository.OrderRepository;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserRepository;
import com.spotchzxk.repository.UserShareRepository;
import com.spotchzxk.service.TradeEngine;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class BotActivityService {

    private static final BigDecimal BOT_INITIAL_BALANCE = BigDecimal.valueOf(1_000_000);
    private static final String BOT_ID_PREFIX = "bot_activity_";

    private final BotActivityProperties properties;
    private final StockRepository stockRepository;
    private final OrderRepository orderRepository;
    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final TradeEngine tradeEngine;

    private final ConcurrentHashMap<String, Long> botNextRunAtMs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Boolean> botLiquidating = new ConcurrentHashMap<>();

    @Scheduled(fixedDelay = 1_000)
    public void tick() {
        if (!properties.isEnabled()) {
            return;
        }

        long now = System.currentTimeMillis();
        initializeBotTimers(now);
        runDueBots(now);
    }

    void runDueBots(long now) {
        List<String> dueBotUserIds = botNextRunAtMs.entrySet().stream()
                .filter(entry -> entry.getValue() <= now)
                .map(Map.Entry::getKey)
                .collect(Collectors.toList());
        if (dueBotUserIds.isEmpty()) {
            return;
        }

        Collections.shuffle(dueBotUserIds);
        int orderLimit = Math.min(dueBotUserIds.size(), Math.max(1, properties.getMaxOrdersPerTick()));

        List<Stock> stocks = stockRepository.findAll();
        if (stocks.isEmpty()) {
            dueBotUserIds.forEach(botUserId -> scheduleBotNextRun(botUserId, now));
            return;
        }

        Map<String, Long> recentBotCounts = recentBotTradeCounts();
        for (int i = 0; i < orderLimit; i++) {
            String botUserId = dueBotUserIds.get(i);
            scheduleBotNextRun(botUserId, now);
            ensureBotUser(botUserId);
            if (handleBotAssetRecovery(botUserId, stocks, recentBotCounts)) {
                continue;
            }
            Stock stock = pickStockForBot(botUserId, stocks, recentBotCounts);
            submitBotOrder(botUserId, stock);
        }
    }

    Stock pickStock(List<Stock> stocks, Map<String, Long> recentBotCounts) {
        if (stocks.isEmpty()) {
            throw new IllegalArgumentException("stocks must not be empty");
        }

        List<Integer> weights = stocks.stream()
                .map(stock -> scoreStock(stock, recentBotCounts))
                .collect(Collectors.toList());
        int totalWeight = weights.stream().mapToInt(Integer::intValue).sum();
        int draw = randomInt(1, Math.max(1, totalWeight));

        int cumulative = 0;
        for (int i = 0; i < stocks.size(); i++) {
            cumulative += weights.get(i);
            if (draw <= cumulative) {
                return stocks.get(i);
            }
        }
        return stocks.get(stocks.size() - 1);
    }

    Stock pickStockForBot(
            String botUserId,
            List<Stock> stocks,
            Map<String, Long> recentBotCounts
    ) {
        BigDecimal balance = findBotBalance(botUserId);
        List<Stock> heldStocks = findHeldStocks(botUserId, stocks);
        if (!heldStocks.isEmpty() && (isCriticalBalance(balance) || isLowBalance(balance))) {
            return pickStock(heldStocks, recentBotCounts);
        }
        return pickStock(stocks, recentBotCounts);
    }

    int pickQuantity(int maxAllowed) {
        int maxQuantity = Math.max(1, Math.min(maxAllowed, properties.getMaxQuantity()));
        int smallQuantityMax = Math.max(1, Math.min(properties.getSmallQuantityMax(), maxQuantity));
        int largeChance = clampPercent(properties.getLargeQuantityChancePercent());
        if (maxQuantity <= smallQuantityMax || randomInt(1, 100) > largeChance) {
            int commonMax = Math.min(smallQuantityMax, maxQuantity);
            return randomInt(1, commonMax);
        }
        return randomInt(smallQuantityMax + 1, maxQuantity);
    }

    String pickTradeType(String botUserId, String channelId) {
        long heldQty = findHeldQuantity(botUserId, channelId);
        if (heldQty <= 0) {
            return "buy";
        }
        BigDecimal balance = findBotBalance(botUserId);
        return pickTradeType(balance, heldQty);
    }

    String pickTradeType(BigDecimal balance, long heldQty) {
        if (heldQty <= 0) {
            return "buy";
        }
        if (isCriticalBalance(balance)) {
            return "sell";
        }

        int buyChance = clampPercent(properties.getBuyChancePercent());
        if (isLowBalance(balance)) {
            buyChance = Math.min(buyChance, clampPercent(properties.getLowBalanceBuyChancePercent()));
        }
        if (heldQty >= Math.max(1, properties.getHighHoldingQuantity())) {
            buyChance = Math.min(buyChance, clampPercent(properties.getHighHoldingBuyChancePercent()));
        }

        return randomInt(1, 100) <= buyChance ? "buy" : "sell";
    }

    private void submitBotOrder(String botUserId, Stock stock) {
        BigDecimal balance = findBotBalance(botUserId);
        long heldQty = findHeldQuantity(botUserId, stock.getChannelId());
        String tradeType = pickTradeType(balance, heldQty);
        submitBotOrder(botUserId, stock, tradeType, heldQty, balance);
    }

    private void submitBotOrder(String botUserId, Stock stock, String tradeType, long heldQty, BigDecimal balance) {
        int maxAllowed = "sell".equals(tradeType)
                ? (int) Math.min(Integer.MAX_VALUE, heldQty)
                : calculateBuyQuantityLimit(stock, balance);

        if (maxAllowed <= 0) {
            return;
        }

        TradeRequest request = new TradeRequest();
        request.setUserId(botUserId);
        request.setStreamerId(stock.getChannelId());
        request.setType(tradeType);
        request.setQuantity(pickQuantity(maxAllowed));
        request.setEstimatedPrice(BigDecimal.valueOf(Math.max(1, stock.getCurrentPrice())));

        try {
            tradeEngine.submitTrade(request);
        } catch (IllegalStateException e) {
            log.debug("Bot activity trade skipped: userId={}, stockId={}, type={}, reason={}",
                    botUserId, stock.getChannelId(), tradeType, e.getMessage());
        } catch (RuntimeException e) {
            log.warn("Bot activity trade failed: userId={}, stockId={}, type={}",
                    botUserId, stock.getChannelId(), tradeType, e);
        }
    }

    boolean handleBotAssetRecovery(
            String botUserId,
            List<Stock> stocks,
            Map<String, Long> recentBotCounts
    ) {
        int thresholdPercent = Math.max(0, properties.getAssetResetThresholdPercent());
        if (thresholdPercent <= 0) {
            botLiquidating.remove(botUserId);
            return false;
        }

        List<UserShare> heldShares = findHeldShares(botUserId);
        BigDecimal totalAssets = calculateTotalAssets(botUserId, heldShares);
        boolean shouldLiquidate = botLiquidating.containsKey(botUserId) || isAssetResetThresholdReached(totalAssets);
        if (!shouldLiquidate) {
            return false;
        }

        botLiquidating.put(botUserId, true);
        if (heldShares.isEmpty()) {
            resetBotAssets(botUserId);
            botLiquidating.remove(botUserId);
            return true;
        }

        Map<String, Stock> stockById = stocks.stream()
                .collect(Collectors.toMap(Stock::getChannelId, stock -> stock, (left, right) -> left));
        List<Stock> sellableHeldStocks = heldShares.stream()
                .map(share -> stockById.getOrDefault(share.getStock().getChannelId(), share.getStock()))
                .filter(stock -> stock != null)
                .collect(Collectors.toList());
        if (sellableHeldStocks.isEmpty()) {
            return true;
        }

        Stock stock = pickStock(sellableHeldStocks, recentBotCounts);
        long heldQty = heldShares.stream()
                .filter(share -> stock.getChannelId().equals(share.getStock().getChannelId()))
                .mapToLong(UserShare::getQuantity)
                .findFirst()
                .orElse(0L);
        submitBotOrder(botUserId, stock, "sell", heldQty, findBotBalance(botUserId));
        return true;
    }

    private boolean isAssetResetThresholdReached(BigDecimal totalAssets) {
        BigDecimal threshold = BOT_INITIAL_BALANCE
                .multiply(BigDecimal.valueOf(Math.max(0, properties.getAssetResetThresholdPercent())))
                .divide(BigDecimal.valueOf(100), 0, java.math.RoundingMode.DOWN);
        return totalAssets.compareTo(threshold) <= 0;
    }

    private BigDecimal calculateTotalAssets(String botUserId, List<UserShare> heldShares) {
        BigDecimal totalAssets = findBotBalance(botUserId);
        for (UserShare share : heldShares) {
            Stock stock = share.getStock();
            if (stock == null) {
                continue;
            }
            totalAssets = totalAssets.add(BigDecimal.valueOf(share.getQuantity())
                    .multiply(BigDecimal.valueOf(Math.max(0, stock.getCurrentPrice()))));
        }
        return totalAssets;
    }

    private void resetBotAssets(String botUserId) {
        userRepository.findById(botUserId).ifPresent(user -> {
            user.setCoinBalance(BOT_INITIAL_BALANCE);
            user.setRealizedProfit(BigDecimal.ZERO);
            userRepository.save(user);
        });
        tradeEngine.evictUserCache(botUserId);
        log.info("Bot assets reset after liquidation: userId={}", botUserId);
    }

    private int calculateBuyQuantityLimit(Stock stock, BigDecimal balance) {
        if (isCriticalBalance(balance)) {
            return 0;
        }
        long remainingSupply = stock.getTotalSupply() > 0
                ? stock.getTotalSupply() - stock.getIssuedShares()
                : properties.getMaxQuantity();
        int supplyLimit = (int) Math.min(properties.getMaxQuantity(), Math.max(0, remainingSupply));
        int affordableLimit = balance
                .divide(BigDecimal.valueOf(Math.max(1, stock.getCurrentPrice())), 0, java.math.RoundingMode.DOWN)
                .intValue();
        int limit = Math.min(supplyLimit, affordableLimit);
        if (isLowBalance(balance)) {
            int reducedLimit = limit * clampPercent(properties.getLowBalanceQuantityPercent()) / 100;
            limit = Math.min(limit, Math.max(1, reducedLimit));
        }
        return Math.max(0, limit);
    }

    int scoreStock(Stock stock, Map<String, Long> recentBotCounts) {
        return Math.max(1, baseScoreStock(stock, recentBotCounts) + randomInt(0, 4));
    }

    int baseScoreStock(Stock stock, Map<String, Long> recentBotCounts) {
        long recentBotCount = recentBotCounts.getOrDefault(stock.getChannelId(), 0L);
        int liveScore = stock.isLive() ? 4 : 0;
        int botCooldownPenalty = (int) Math.min(10, recentBotCount * 3);
        return Math.max(1, liveScore - botCooldownPenalty);
    }

    private Map<String, Long> recentBotTradeCounts() {
        return orderRepository.findTop50BotCompletedByOrderByCreatedAtDesc().stream()
                .collect(Collectors.groupingBy(Order::getStreamerId, Collectors.counting()));
    }

    private void ensureBotUser(String userId) {
        User existing = userRepository.findById(userId).orElse(null);
        if (existing == null) {
            // 최초 생성 / First-time creation
            userRepository.save(User.builder()
                    .id(userId)
                    .coinBalance(BOT_INITIAL_BALANCE)
                    .isBot(true)
                    .build());
            return;
        }
        // 이미 존재하는 경우: 실제 변경이 있을 때만 저장 / Only save if something needs fixing
        boolean modified = false;
        if (!existing.isBot()) { existing.setBot(true); modified = true; }
        if (existing.getCoinBalance() == null) { existing.setCoinBalance(BOT_INITIAL_BALANCE); modified = true; }
        if (modified) userRepository.save(existing);
    }

    private long findHeldQuantity(String userId, String channelId) {
        Optional<UserShare> share = userShareRepository.findByUserIdAndStockChannelId(userId, channelId);
        return share.map(UserShare::getQuantity).orElse(0L);
    }

    private List<Stock> findHeldStocks(String userId, List<Stock> stocks) {
        Map<String, Stock> stockById = stocks.stream()
                .collect(Collectors.toMap(Stock::getChannelId, stock -> stock, (left, right) -> left));
        return findHeldShares(userId).stream()
                .map(share -> share.getStock().getChannelId())
                .map(stockById::get)
                .filter(heldStock -> heldStock != null)
                .collect(Collectors.toList());
    }

    private List<UserShare> findHeldShares(String userId) {
        return userShareRepository.findByUserIdWithPositiveQuantityAndStock(userId);
    }

    private BigDecimal findBotBalance(String userId) {
        Optional<User> user = userRepository.findById(userId);
        if (user == null || user.isEmpty() || user.get().getCoinBalance() == null) {
            return BOT_INITIAL_BALANCE;
        }
        return user.get().getCoinBalance();
    }

    private boolean isLowBalance(BigDecimal balance) {
        return balancePercent(balance) <= clampPercent(properties.getLowBalanceThresholdPercent());
    }

    private boolean isCriticalBalance(BigDecimal balance) {
        return balancePercent(balance) <= clampPercent(properties.getCriticalBalanceThresholdPercent());
    }

    private int balancePercent(BigDecimal balance) {
        return balance
                .multiply(BigDecimal.valueOf(100))
                .divide(BOT_INITIAL_BALANCE, 0, java.math.RoundingMode.DOWN)
                .intValue();
    }

    String botUserId(int botNumber) {
        return BOT_ID_PREFIX + String.format("%03d", botNumber);
    }

    private void initializeBotTimers(long nowMs) {
        int userCount = Math.max(1, properties.getUserCount());
        for (int i = 1; i <= userCount; i++) {
            String botUserId = botUserId(i);
            botNextRunAtMs.computeIfAbsent(botUserId, ignored -> nowMs + randomDelayMs());
        }
        botNextRunAtMs.keySet().removeIf(botUserId -> botNumber(botUserId) > userCount);
        botLiquidating.keySet().removeIf(botUserId -> botNumber(botUserId) > userCount);
    }

    private void scheduleBotNextRun(String botUserId, long nowMs) {
        botNextRunAtMs.put(botUserId, nowMs + randomDelayMs());
    }

    private long randomDelayMs() {
        int min = Math.max(1, properties.getMinDelaySeconds());
        int max = Math.max(min, properties.getMaxDelaySeconds());
        return randomInt(min, max) * 1_000L;
    }

    private int botNumber(String botUserId) {
        if (!botUserId.startsWith(BOT_ID_PREFIX)) {
            return Integer.MAX_VALUE;
        }
        try {
            return Integer.parseInt(botUserId.substring(BOT_ID_PREFIX.length()));
        } catch (NumberFormatException e) {
            return Integer.MAX_VALUE;
        }
    }

    private int randomInt(int minInclusive, int maxInclusive) {
        return ThreadLocalRandom.current().nextInt(minInclusive, maxInclusive + 1);
    }

    private int clampPercent(int value) {
        return Math.max(0, Math.min(100, value));
    }
}
