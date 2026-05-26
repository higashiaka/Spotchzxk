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
import java.util.Comparator;
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

        Map<String, Long> recentCounts = recentTradeCounts();
        for (int i = 0; i < orderLimit; i++) {
            String botUserId = dueBotUserIds.get(i);
            scheduleBotNextRun(botUserId, now);
            Stock stock = pickStock(stocks, recentCounts);
            ensureBotUser(botUserId);
            submitBotOrder(botUserId, stock);
        }
    }

    Stock pickStock(List<Stock> stocks, Map<String, Long> recentCounts) {
        return stocks.stream()
                .max(Comparator.comparingInt(stock -> scoreStock(stock, recentCounts)))
                .orElseThrow();
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
        return randomInt(1, 100) <= clampPercent(properties.getBuyChancePercent()) ? "buy" : "sell";
    }

    private void submitBotOrder(String botUserId, Stock stock) {
        String tradeType = pickTradeType(botUserId, stock.getChannelId());
        long heldQty = findHeldQuantity(botUserId, stock.getChannelId());
        int maxAllowed = "sell".equals(tradeType)
                ? (int) Math.min(Integer.MAX_VALUE, heldQty)
                : calculateBuyQuantityLimit(stock);

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

    private int calculateBuyQuantityLimit(Stock stock) {
        long remainingSupply = stock.getTotalSupply() > 0
                ? stock.getTotalSupply() - stock.getIssuedShares()
                : properties.getMaxQuantity();
        return (int) Math.min(properties.getMaxQuantity(), Math.max(0, remainingSupply));
    }

    private int scoreStock(Stock stock, Map<String, Long> recentCounts) {
        long recentCount = recentCounts.getOrDefault(stock.getChannelId(), 0L);
        int inactivityScore = (int) Math.max(0, 10 - recentCount);
        int liveScore = stock.isLive() ? 8 : 0;
        return inactivityScore + liveScore + randomInt(0, 5);
    }

    private Map<String, Long> recentTradeCounts() {
        return orderRepository.findTop50ByOrderByCreatedAtDesc().stream()
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
