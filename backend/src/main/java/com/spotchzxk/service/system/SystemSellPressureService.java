package com.spotchzxk.service.system;

import com.spotchzxk.dto.TradeRequest;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.entity.User;
import com.spotchzxk.entity.UserShare;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserRepository;
import com.spotchzxk.repository.UserShareRepository;
import com.spotchzxk.service.TradeEngine;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class SystemSellPressureService {

    static final String SYSTEM_SELL_USER_ID = "__system_sell_pressure__";
    private static final BigDecimal SYSTEM_BALANCE = BigDecimal.valueOf(1_000_000_000_000L);

    private final SystemSellPressureProperties properties;
    private final StockRepository stockRepository;
    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final TradeEngine tradeEngine;

    private final ConcurrentHashMap<String, PressureState> states = new ConcurrentHashMap<>();
    private volatile LocalDate dailyLimitDate = LocalDate.now();

    @Scheduled(fixedDelay = 1_000)
    public void tick() {
        if (!properties.isEnabled()) {
            return;
        }

        long now = System.currentTimeMillis();
        resetDailyLimitsIfNeeded();
        List<Stock> candidates = stockRepository.findAll().stream()
                .filter(this::hasValidReferencePrice)
                .collect(Collectors.toList());
        if (candidates.isEmpty()) {
            return;
        }

        Collections.shuffle(candidates);
        int executed = 0;
        for (Stock stock : candidates) {
            if (executed >= Math.max(1, properties.getMaxOrdersPerTick())) {
                break;
            }
            if (runStockIfDue(stock, now)) {
                executed++;
            }
        }
    }

    boolean runStockIfDue(Stock stock, long now) {
        PressureState state = stateFor(stock.getChannelId(), now);
        if (state.nextRunAtMs > now) {
            return false;
        }

        refreshHighPricePressure(stock, state);
        int baseGainPercent = gainPercent(stock, state);
        int effectiveGainPercent = effectiveGainPercent(stock, state, baseGainPercent);

        if (!state.active && baseGainPercent < state.startGainPercent) {
            state.nextRunAtMs = now + randomDelayMs(properties.getWeak());
            return false;
        }
        if (state.active && baseGainPercent <= state.stopGainPercent) {
            state.active = false;
            state.consecutiveSells.set(0);
            state.nextRunAtMs = now + randomDelayMs(properties.getWeak());
            return false;
        }

        state.active = true;
        if (randomInt(1, 100) > clampPercent(properties.getExecutionChancePercent())) {
            state.nextRunAtMs = now + randomDelayMs(tierFor(effectiveGainPercent, state));
            return false;
        }

        int quantity = pickQuantity(stock, effectiveGainPercent, state);
        if (quantity <= 0) {
            state.nextRunAtMs = now + randomDelayMs(properties.getWeak());
            return false;
        }

        ensureSystemHoldings(stock, quantity);
        submitSystemSell(stock, quantity);
        state.soldToday.addAndGet(quantity);
        int consecutiveSells = state.consecutiveSells.incrementAndGet();
        if (consecutiveSells >= state.maxConsecutiveSells) {
            state.consecutiveSells.set(0);
            state.maxConsecutiveSells = randomInt(properties.getMaxConsecutiveSellMin(), properties.getMaxConsecutiveSellMax());
            state.nextRunAtMs = now + randomSeconds(properties.getCooldownMinSeconds(), properties.getCooldownMaxSeconds()) * 1_000L;
        } else {
            state.nextRunAtMs = now + randomDelayMs(tierFor(effectiveGainPercent, state));
        }
        return true;
    }

    public void evictStockState(String channelId) {
        states.remove(channelId);
    }

    PressureState stateFor(String channelId, long now) {
        return states.compute(channelId, (ignored, existing) -> {
            if (existing == null || existing.expiresAtMs <= now) {
                return newState(now);
            }
            return existing;
        });
    }

    int gainPercent(Stock stock) {
        return gainPercent(stock, stateFor(stock.getChannelId(), System.currentTimeMillis()));
    }

    int gainPercent(Stock stock, PressureState state) {
        int basePrice = Math.max(1, referencePrice(stock, state));
        int currentPrice = Math.max(1, stock.getCurrentPrice());
        return BigDecimal.valueOf(currentPrice - basePrice)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(basePrice), 0, RoundingMode.DOWN)
                .intValue();
    }

    int referencePrice(Stock stock, PressureState state) {
        int listingPrice = stock.getListingPrice() > 0 ? stock.getListingPrice() : stock.getBasePrice();
        long dailyAdjustedPrice = stock.getBasePrice() <= 0
                ? 0
                : (long) stock.getBasePrice() * Math.max(0, state.dailyReferenceRatioPercent) / 100;
        return (int) Math.min(Integer.MAX_VALUE, Math.max(listingPrice, dailyAdjustedPrice));
    }

    int effectiveGainPercent(Stock stock, PressureState state, int baseGainPercent) {
        if (!state.highPriceActive) {
            return baseGainPercent;
        }
        int currentPrice = Math.max(1, stock.getCurrentPrice());
        int referencePrice = Math.max(1, currentPrice / Math.max(1, state.highPriceReferenceDivisor));
        return BigDecimal.valueOf(currentPrice - referencePrice)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(referencePrice), 0, RoundingMode.DOWN)
                .intValue();
    }

    private void refreshHighPricePressure(Stock stock, PressureState state) {
        int currentPrice = Math.max(1, stock.getCurrentPrice());
        if (currentPrice >= state.highPriceTriggerPrice) {
            state.highPriceActive = true;
            return;
        }
        if (state.highPriceActive && currentPrice <= state.highPriceStopPrice) {
            state.highPriceActive = false;
        }
    }

    int pickQuantity(Stock stock, int gainPercent, PressureState state) {
        SystemSellPressureProperties.Tier tier = tierFor(gainPercent, state);
        int quantity = randomInt(tier.getQuantityMin(), tier.getQuantityMax());
        int dailyRemaining = Math.max(0, state.dailySellLimit - state.soldToday.get());
        int maxPerOrder = Math.max(1, properties.getMaxQuantityPerOrder());
        return Math.max(0, Math.min(quantity, Math.min(maxPerOrder, dailyRemaining)));
    }

    private SystemSellPressureProperties.Tier tierFor(int gainPercent, PressureState state) {
        int overStart = gainPercent - state.startGainPercent;
        if (overStart >= 1_200) {
            return properties.getExtreme();
        }
        if (overStart >= 600) {
            return properties.getStrong();
        }
        if (overStart >= 200) {
            return properties.getMedium();
        }
        return properties.getWeak();
    }

    private void ensureSystemHoldings(Stock stock, int quantity) {
        User systemUser = ensureSystemUser();
        Optional<UserShare> existing = userShareRepository.findByUserIdAndStockChannelId(
                SYSTEM_SELL_USER_ID, stock.getChannelId());
        UserShare share = existing.orElseGet(() -> UserShare.builder()
                .user(systemUser)
                .stock(stock)
                .quantity(0L)
                .preStreamQuantity(0L)
                .avgPrice(BigDecimal.valueOf(Math.max(1, stock.getCurrentPrice())))
                .build());
        long currentQuantity = share.getQuantity();
        if (currentQuantity >= quantity) {
            return;
        }
        share.updateOnBuy(quantity, BigDecimal.valueOf(Math.max(1, stock.getCurrentPrice())));
        userShareRepository.save(share);
        tradeEngine.evictUserCache(SYSTEM_SELL_USER_ID);
    }

    private User ensureSystemUser() {
        Optional<User> existing = userRepository.findById(SYSTEM_SELL_USER_ID);
        if (existing.isPresent()) {
            User user = existing.get();
            boolean modified = false;
            if (!user.isBot()) {
                user.markAsBot();
                modified = true;
            }
            if (user.getCoinBalance() == null || user.getCoinBalance().compareTo(SYSTEM_BALANCE) < 0) {
                user.updateBalance(SYSTEM_BALANCE);
                modified = true;
            }
            return modified ? userRepository.save(user) : user;
        }

        return userRepository.save(User.builder()
                .id(SYSTEM_SELL_USER_ID)
                .coinBalance(SYSTEM_BALANCE)
                .displayName("System Sell")
                .isBot(true)
                .build());
    }

    private void submitSystemSell(Stock stock, int quantity) {
        TradeRequest request = new TradeRequest();
        request.setUserId(SYSTEM_SELL_USER_ID);
        request.setStreamerId(stock.getChannelId());
        request.setType("sell");
        request.setQuantity(quantity);
        request.setEstimatedPrice(BigDecimal.valueOf(Math.max(1, stock.getCurrentPrice())));
        request.setOrderMode("market");

        try {
            tradeEngine.submitTrade(request);
        } catch (IllegalStateException e) {
            log.debug("System sell pressure skipped: stockId={}, quantity={}, reason={}",
                    stock.getChannelId(), quantity, e.getMessage());
        } catch (RuntimeException e) {
            log.warn("System sell pressure failed: stockId={}, quantity={}",
                    stock.getChannelId(), quantity, e);
        }
    }

    private PressureState newState(long now) {
        int start = randomInt(properties.getStartGainMinPercent(), properties.getStartGainMaxPercent());
        int stop = randomInt(properties.getStopGainMinPercent(), Math.min(properties.getStopGainMaxPercent(), start - 1));
        PressureState state = new PressureState();
        state.startGainPercent = start;
        state.stopGainPercent = stop;
        state.highPriceTriggerPrice = randomInt(properties.getHighPriceTriggerMin(), properties.getHighPriceTriggerMax());
        int stopRatio = randomInt(properties.getHighPriceStopRatioMinPercent(), properties.getHighPriceStopRatioMaxPercent());
        state.highPriceStopPrice = Math.max(1, state.highPriceTriggerPrice * stopRatio / 100);
        state.highPriceReferenceDivisor = randomInt(
                properties.getHighPriceReferenceDivisorMin(),
                properties.getHighPriceReferenceDivisorMax());
        state.dailyReferenceRatioPercent = randomInt(
                properties.getDailyReferenceRatioMinPercent(),
                properties.getDailyReferenceRatioMaxPercent());
        state.expiresAtMs = now + randomInt(properties.getStateTtlMinHours(), properties.getStateTtlMaxHours()) * 3_600_000L;
        state.nextRunAtMs = now + randomDelayMs(properties.getWeak());
        state.dailySellLimit = randomInt(properties.getDailySellLimitMin(), properties.getDailySellLimitMax());
        state.maxConsecutiveSells = randomInt(properties.getMaxConsecutiveSellMin(), properties.getMaxConsecutiveSellMax());
        return state;
    }

    private void resetDailyLimitsIfNeeded() {
        LocalDate today = LocalDate.now();
        if (today.equals(dailyLimitDate)) {
            return;
        }
        dailyLimitDate = today;
        states.values().forEach(state -> {
            state.soldToday.set(0);
            state.dailySellLimit = randomInt(properties.getDailySellLimitMin(), properties.getDailySellLimitMax());
        });
    }

    private boolean hasValidReferencePrice(Stock stock) {
        return stock.getCurrentPrice() > 0
                && (stock.getListingPrice() > 0 || stock.getBasePrice() > 0);
    }

    private long randomDelayMs(SystemSellPressureProperties.Tier tier) {
        return randomSeconds(tier.getIntervalMinSeconds(), tier.getIntervalMaxSeconds()) * 1_000L;
    }

    private int randomSeconds(int min, int max) {
        return randomInt(Math.max(1, min), Math.max(Math.max(1, min), max));
    }

    private int randomInt(int minInclusive, int maxInclusive) {
        int min = Math.max(0, minInclusive);
        int max = Math.max(min, maxInclusive);
        return ThreadLocalRandom.current().nextInt(min, max + 1);
    }

    private int clampPercent(int value) {
        return Math.max(0, Math.min(100, value));
    }

    // Issue #12: volatile/AtomicInteger로 필드 접근 안전성 보장
    static class PressureState {
        volatile int startGainPercent;
        volatile int stopGainPercent;
        volatile long nextRunAtMs;
        volatile long expiresAtMs;
        volatile boolean active;
        final AtomicInteger consecutiveSells = new AtomicInteger(0);
        volatile int maxConsecutiveSells;
        final AtomicInteger soldToday = new AtomicInteger(0);
        volatile int dailySellLimit;
        volatile int highPriceTriggerPrice;
        volatile int highPriceStopPrice;
        volatile int highPriceReferenceDivisor;
        volatile boolean highPriceActive;
        volatile int dailyReferenceRatioPercent;
    }
}
