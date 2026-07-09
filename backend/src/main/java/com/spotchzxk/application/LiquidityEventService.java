package com.spotchzxk.application;

import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.trading.entity.LiquidityEvent;
import com.spotchzxk.domain.trading.entity.LiquidityEventPhase;
import com.spotchzxk.domain.trading.repository.LiquidityEventRepository;
import com.spotchzxk.domain.trading.service.MarketPrice;
import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import com.spotchzxk.presentation.dto.TradeRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Service
@RequiredArgsConstructor
@Slf4j
public class LiquidityEventService {

    private static final String SYSTEM_USER_ID = "system:liquidity";
    private static final BigDecimal SYSTEM_BALANCE = new BigDecimal("1000000000000000000");
    private static final BigDecimal MIN_PRICE = new BigDecimal("0.000001");
    private static final List<LiquidityEventPhase> RUNNING_PHASES = List.of(
            LiquidityEventPhase.ACCUMULATION,
            LiquidityEventPhase.PUMP,
            LiquidityEventPhase.CLIMAX,
            LiquidityEventPhase.DUMP
    );
    private static final List<LiquidityEventPhase> BLOCKING_PHASES = List.of(
            LiquidityEventPhase.ACCUMULATION,
            LiquidityEventPhase.PUMP,
            LiquidityEventPhase.CLIMAX,
            LiquidityEventPhase.DUMP,
            LiquidityEventPhase.COOLDOWN
    );
    private static final Set<String> SETTING_KEYS = Set.of(
            "liquidity-events.enabled",
            "liquidity-events.start-chance-percent",
            "liquidity-events.daily-limit-per-stock",
            "liquidity-events.tick-min-seconds",
            "liquidity-events.tick-max-seconds",
            "liquidity-events.min-duration-minutes",
            "liquidity-events.max-duration-minutes",
            "liquidity-events.min-rise-percent",
            "liquidity-events.max-rise-percent",
            "liquidity-events.dump-retain-percent",
            "liquidity-events.cooldown-minutes",
            "liquidity-events.quantity-jitter-min-percent",
            "liquidity-events.quantity-jitter-max-percent",
            "liquidity-events.dump-quantity-jitter-min-percent",
            "liquidity-events.dump-quantity-jitter-max-percent",
            "liquidity-events.buy-quantity-min",
            "liquidity-events.buy-quantity-max",
            "liquidity-events.sell-holding-min-percent",
            "liquidity-events.sell-holding-max-percent",
            "liquidity-events.dump-sell-holding-min-percent",
            "liquidity-events.dump-sell-holding-max-percent"
    );

    private final LiquidityEventRepository liquidityEventRepository;
    private final StockRepository stockRepository;
    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final PlatformTransactionManager txManager;
    private final AppStateService appStateService;

    @org.springframework.beans.factory.annotation.Autowired
    @org.springframework.context.annotation.Lazy
    private TradeEngine tradeEngine;

    @Value("${liquidity-events.enabled:false}")
    private boolean defaultEnabled;

    @Value("${liquidity-events.start-chance-percent:0.15}")
    private BigDecimal defaultStartChancePercent;

    @Value("${liquidity-events.daily-limit-per-stock:1}")
    private int defaultDailyLimitPerStock;

    @Value("${liquidity-events.tick-min-seconds:12}")
    private int defaultTickMinSeconds;

    @Value("${liquidity-events.tick-max-seconds:35}")
    private int defaultTickMaxSeconds;

    @Value("${liquidity-events.min-duration-minutes:10}")
    private int defaultMinDurationMinutes;

    @Value("${liquidity-events.max-duration-minutes:30}")
    private int defaultMaxDurationMinutes;

    @Value("${liquidity-events.max-rise-percent:300}")
    private BigDecimal defaultMaxRisePercent;

    @Value("${liquidity-events.min-rise-percent:80}")
    private BigDecimal defaultMinRisePercent;

    @Value("${liquidity-events.dump-retain-percent:35}")
    private BigDecimal defaultDumpRetainPercent;

    @Value("${liquidity-events.cooldown-minutes:360}")
    private int defaultCooldownMinutes;

    @Value("${liquidity-events.quantity-jitter-min-percent:45}")
    private int defaultQuantityJitterMinPercent;

    @Value("${liquidity-events.quantity-jitter-max-percent:135}")
    private int defaultQuantityJitterMaxPercent;

    @Value("${liquidity-events.dump-quantity-jitter-min-percent:55}")
    private int defaultDumpQuantityJitterMinPercent;

    @Value("${liquidity-events.dump-quantity-jitter-max-percent:165}")
    private int defaultDumpQuantityJitterMaxPercent;

    @Value("${liquidity-events.buy-quantity-min:10}")
    private int defaultBuyQuantityMin;

    @Value("${liquidity-events.buy-quantity-max:15}")
    private int defaultBuyQuantityMax;

    @Value("${liquidity-events.sell-holding-min-percent:12}")
    private int defaultSellHoldingMinPercent;

    @Value("${liquidity-events.sell-holding-max-percent:32}")
    private int defaultSellHoldingMaxPercent;

    @Value("${liquidity-events.dump-sell-holding-min-percent:25}")
    private int defaultDumpSellHoldingMinPercent;

    @Value("${liquidity-events.dump-sell-holding-max-percent:55}")
    private int defaultDumpSellHoldingMaxPercent;

    public boolean isSystemUser(String userId) {
        return SYSTEM_USER_ID.equals(userId);
    }

    public void maybeStartAfterUserTrade(String channelId, String userId) {
        LiquiditySettings settings = settings();
        if (!settings.enabled() || isSystemUser(userId) || channelId == null || channelId.isBlank()) {
            return;
        }
        if (!roll(settings.startChancePercent())) {
            return;
        }
        try {
            new TransactionTemplate(txManager).executeWithoutResult(status -> startIfEligible(channelId, settings));
        } catch (RuntimeException e) {
            log.debug("Liquidity event start skipped for {}: {}", channelId, e.getMessage());
        }
    }

    @Scheduled(fixedDelayString = "${liquidity-events.scheduler-delay-ms:15000}")
    public void processEvents() {
        LiquiditySettings settings = settings();
        if (!settings.enabled()) {
            return;
        }
        ensureSystemUser();
        List<LiquidityEvent> events = new TransactionTemplate(txManager)
                .execute(status -> liquidityEventRepository.findActiveForUpdate(RUNNING_PHASES));
        if (events == null || events.isEmpty()) {
            return;
        }
        for (LiquidityEvent event : events) {
            try {
                processEvent(event.getId(), settings);
            } catch (RuntimeException e) {
                log.warn("Liquidity event tick failed: eventId={}, stock={}", event.getId(), event.getChannelId(), e);
            }
        }
    }

    @Scheduled(fixedDelayString = "${liquidity-events.cooldown-scheduler-delay-ms:60000}")
    public void completeExpiredCooldowns() {
        if (!settings().enabled()) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        new TransactionTemplate(txManager).executeWithoutResult(status ->
                liquidityEventRepository.findAll().stream()
                        .filter(e -> e.getPhase() == LiquidityEventPhase.COOLDOWN)
                        .filter(e -> e.getCooldownUntil() != null && !e.getCooldownUntil().isAfter(now))
                        .forEach(LiquidityEvent::complete)
        );
    }

    private void startIfEligible(String channelId, LiquiditySettings settings) {
        LocalDateTime now = LocalDateTime.now();
        if (liquidityEventRepository.existsByChannelIdAndPhaseIn(channelId, BLOCKING_PHASES)) {
            return;
        }
        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        if (liquidityEventRepository.countByChannelIdAndStartedAtGreaterThanEqual(channelId, todayStart) >= settings.dailyLimitPerStock()) {
            return;
        }
        Stock stock = stockRepository.findById(channelId).orElse(null);
        if (stock == null || stock.isTradingSuspended() || stock.getListedAt() == null) {
            return;
        }
        BigDecimal currentPrice = MarketPrice.spotPrice(stock);
        if (currentPrice.compareTo(MIN_PRICE) <= 0 || stock.getCoinReserve().signum() <= 0 || stock.getShareReserve().signum() <= 0) {
            return;
        }
        int durationMinutes = randomInt(settings.minDurationMinutes(), settings.maxDurationMinutes());
        BigDecimal risePercent = randomPercent(settings.minRisePercent(), settings.maxRisePercent());
        BigDecimal peakMultiplier = BigDecimal.ONE.add(risePercent.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        BigDecimal targetPeak = currentPrice.multiply(peakMultiplier).setScale(6, RoundingMode.HALF_UP);
        BigDecimal dumpTarget = currentPrice.multiply(settings.dumpRetainPercent())
                .divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP)
                .max(MIN_PRICE);
        liquidityEventRepository.save(LiquidityEvent.builder()
                .id(UUID.randomUUID().toString())
                .channelId(channelId)
                .phase(LiquidityEventPhase.ACCUMULATION)
                .startedAt(now)
                .phaseStartedAt(now)
                .phaseEndsAt(now.plusMinutes(Math.max(1, durationMinutes / 5)))
                .startPrice(currentPrice)
                .targetPeakPrice(targetPeak)
                .dumpTargetPrice(dumpTarget)
                .dumpSteps(randomInt(2, 5))
                .build());
        log.info("Liquidity event started: stock={}, startPrice={}, targetPeak={}, dumpTarget={}",
                channelId, currentPrice, targetPeak, dumpTarget);
    }

    private void processEvent(String eventId, LiquiditySettings settings) {
        LiquidityEvent event = new TransactionTemplate(txManager).execute(status ->
                liquidityEventRepository.findById(eventId).orElse(null));
        if (event == null || !RUNNING_PHASES.contains(event.getPhase())) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        if (event.getLastTradeAt() != null
                && event.getLastTradeAt().plusSeconds(randomInt(settings.tickMinSeconds(), settings.tickMaxSeconds())).isAfter(now)) {
            return;
        }
        Stock stock = stockRepository.findById(event.getChannelId()).orElse(null);
        if (stock == null || stock.isTradingSuspended()) {
            startCooldown(event.getId(), now);
            return;
        }
        if (!event.getPhaseEndsAt().isAfter(now)) {
            advancePhase(event.getId(), event.getPhase(), now, settings);
            return;
        }

        boolean buy = shouldBuy(event.getPhase());
        BigDecimal currentPrice = MarketPrice.spotPrice(stock);
        BigInteger qty;
        if (buy) {
            qty = randomBuyQuantity(stock, settings);
        } else if (event.getPhase() == LiquidityEventPhase.DUMP) {
            qty = dumpStepQuantity(event, settings);
        } else {
            qty = holdingPercentQuantity(event.getChannelId(), settings.sellHoldingMinPercent(), settings.sellHoldingMaxPercent());
            if (qty.signum() <= 0) {
                buy = true;
                qty = randomBuyQuantity(stock, settings);
            }
        }
        if (!buy) {
            qty = capToSystemHolding(event.getChannelId(), qty);
        }
        if (qty.signum() <= 0) {
            return;
        }
        submitSystemTrade(event, buy, qty, currentPrice, now);
    }

    private void advancePhase(String eventId, LiquidityEventPhase phase, LocalDateTime now, LiquiditySettings settings) {
        new TransactionTemplate(txManager).executeWithoutResult(status -> {
            LiquidityEvent event = liquidityEventRepository.findById(eventId).orElse(null);
            if (event == null) return;
            switch (phase) {
                case ACCUMULATION -> event.advanceTo(LiquidityEventPhase.PUMP, now, now.plusMinutes(randomInt(7, 18)));
                case PUMP -> event.advanceTo(LiquidityEventPhase.CLIMAX, now, now.plusMinutes(randomInt(1, 3)));
                case CLIMAX -> event.advanceTo(LiquidityEventPhase.DUMP, now, now.plusMinutes(randomInt(1, 4)));
                case DUMP -> event.startCooldown(now, now.plusMinutes(settings.cooldownMinutes()));
                default -> { }
            }
        });
    }

    private void startCooldown(String eventId, LocalDateTime now) {
        new TransactionTemplate(txManager).executeWithoutResult(status ->
                liquidityEventRepository.findById(eventId)
                        .ifPresent(e -> e.startCooldown(now, now.plusMinutes(settings().cooldownMinutes()))));
    }

    public Map<String, String> currentSettings() {
        return appStateService.getByPrefix("liquidity-events.");
    }

    public void updateSetting(String key, String value) {
        if (!SETTING_KEYS.contains(key)) {
            throw new IllegalArgumentException("Unsupported liquidity event setting: " + key);
        }
        appStateService.put(key, value);
    }

    private LiquiditySettings settings() {
        return new LiquiditySettings(
                appStateService.getBoolean("liquidity-events.enabled", defaultEnabled),
                appStateService.getDecimal("liquidity-events.start-chance-percent", defaultStartChancePercent),
                appStateService.getInt("liquidity-events.daily-limit-per-stock", defaultDailyLimitPerStock),
                appStateService.getInt("liquidity-events.tick-min-seconds", defaultTickMinSeconds),
                appStateService.getInt("liquidity-events.tick-max-seconds", defaultTickMaxSeconds),
                appStateService.getInt("liquidity-events.min-duration-minutes", defaultMinDurationMinutes),
                appStateService.getInt("liquidity-events.max-duration-minutes", defaultMaxDurationMinutes),
                appStateService.getDecimal("liquidity-events.min-rise-percent", defaultMinRisePercent),
                appStateService.getDecimal("liquidity-events.max-rise-percent", defaultMaxRisePercent),
                appStateService.getDecimal("liquidity-events.dump-retain-percent", defaultDumpRetainPercent),
                appStateService.getInt("liquidity-events.cooldown-minutes", defaultCooldownMinutes),
                appStateService.getInt("liquidity-events.quantity-jitter-min-percent", defaultQuantityJitterMinPercent),
                appStateService.getInt("liquidity-events.quantity-jitter-max-percent", defaultQuantityJitterMaxPercent),
                appStateService.getInt("liquidity-events.dump-quantity-jitter-min-percent", defaultDumpQuantityJitterMinPercent),
                appStateService.getInt("liquidity-events.dump-quantity-jitter-max-percent", defaultDumpQuantityJitterMaxPercent),
                appStateService.getInt("liquidity-events.buy-quantity-min", defaultBuyQuantityMin),
                appStateService.getInt("liquidity-events.buy-quantity-max", defaultBuyQuantityMax),
                appStateService.getInt("liquidity-events.sell-holding-min-percent", defaultSellHoldingMinPercent),
                appStateService.getInt("liquidity-events.sell-holding-max-percent", defaultSellHoldingMaxPercent),
                appStateService.getInt("liquidity-events.dump-sell-holding-min-percent", defaultDumpSellHoldingMinPercent),
                appStateService.getInt("liquidity-events.dump-sell-holding-max-percent", defaultDumpSellHoldingMaxPercent)
        ).normalized();
    }

    private record LiquiditySettings(
            boolean enabled,
            BigDecimal startChancePercent,
            int dailyLimitPerStock,
            int tickMinSeconds,
            int tickMaxSeconds,
            int minDurationMinutes,
            int maxDurationMinutes,
            BigDecimal minRisePercent,
            BigDecimal maxRisePercent,
            BigDecimal dumpRetainPercent,
            int cooldownMinutes,
            int quantityJitterMinPercent,
            int quantityJitterMaxPercent,
            int dumpQuantityJitterMinPercent,
            int dumpQuantityJitterMaxPercent,
            int buyQuantityMin,
            int buyQuantityMax,
            int sellHoldingMinPercent,
            int sellHoldingMaxPercent,
            int dumpSellHoldingMinPercent,
            int dumpSellHoldingMaxPercent
    ) {
        private LiquiditySettings normalized() {
            int safeTickMin = Math.max(1, tickMinSeconds);
            int safeTickMax = Math.max(safeTickMin, tickMaxSeconds);
            int safeDurationMin = Math.max(1, minDurationMinutes);
            int safeDurationMax = Math.max(safeDurationMin, maxDurationMinutes);
            int safeJitterMin = Math.max(1, quantityJitterMinPercent);
            int safeJitterMax = Math.max(safeJitterMin, quantityJitterMaxPercent);
            int safeDumpJitterMin = Math.max(1, dumpQuantityJitterMinPercent);
            int safeDumpJitterMax = Math.max(safeDumpJitterMin, dumpQuantityJitterMaxPercent);
            int safeBuyMin = Math.max(1, buyQuantityMin);
            int safeBuyMax = Math.max(safeBuyMin, buyQuantityMax);
            int safeSellMin = Math.max(1, sellHoldingMinPercent);
            int safeSellMax = Math.max(safeSellMin, sellHoldingMaxPercent);
            int safeDumpSellMin = Math.max(1, dumpSellHoldingMinPercent);
            int safeDumpSellMax = Math.max(safeDumpSellMin, dumpSellHoldingMaxPercent);
            BigDecimal safeMinRise = minRisePercent != null ? minRisePercent.max(BigDecimal.ZERO) : BigDecimal.ZERO;
            BigDecimal safeMaxRise = maxRisePercent != null && maxRisePercent.compareTo(safeMinRise) >= 0 ? maxRisePercent : safeMinRise;
            BigDecimal safeDumpRetain = dumpRetainPercent != null ? dumpRetainPercent.max(BigDecimal.ZERO) : BigDecimal.ZERO;
            return new LiquiditySettings(
                    enabled,
                    startChancePercent != null ? startChancePercent.max(BigDecimal.ZERO) : BigDecimal.ZERO,
                    Math.max(0, dailyLimitPerStock),
                    safeTickMin,
                    safeTickMax,
                    safeDurationMin,
                    safeDurationMax,
                    safeMinRise,
                    safeMaxRise,
                    safeDumpRetain,
                    Math.max(1, cooldownMinutes),
                    safeJitterMin,
                    safeJitterMax,
                    safeDumpJitterMin,
                    safeDumpJitterMax,
                    safeBuyMin,
                    safeBuyMax,
                    safeSellMin,
                    safeSellMax,
                    safeDumpSellMin,
                    safeDumpSellMax
            );
        }
    }

    private boolean shouldBuy(LiquidityEventPhase phase) {
        int n = ThreadLocalRandom.current().nextInt(100);
        return switch (phase) {
            case ACCUMULATION -> n < 58;
            case PUMP -> n < 78;
            case CLIMAX -> n < 92;
            case DUMP -> false;
            default -> false;
        };
    }

    private BigInteger randomBuyQuantity(Stock stock, LiquiditySettings settings) {
        BigInteger requested = BigInteger.valueOf(randomInt(settings.buyQuantityMin(), settings.buyQuantityMax()));
        return requested.min(stock.getShareReserve()).max(BigInteger.ONE);
    }

    private BigInteger holdingPercentQuantity(String channelId, int minPercent, int maxPercent) {
        BigInteger held = systemHolding(channelId);
        if (held.signum() <= 0) {
            return BigInteger.ZERO;
        }
        int percent = randomInt(minPercent, maxPercent);
        return held.multiply(BigInteger.valueOf(percent))
                .divide(BigInteger.valueOf(100))
                .max(BigInteger.ONE);
    }

    private BigInteger dumpStepQuantity(LiquidityEvent event, LiquiditySettings settings) {
        BigInteger held = systemHolding(event.getChannelId());
        if (held.signum() <= 0) {
            return BigInteger.ZERO;
        }
        int remainingSteps = Math.max(1, event.getDumpSteps() - event.getDumpTradeCount());
        BigInteger stepQty = held.divide(BigInteger.valueOf(remainingSteps)).max(BigInteger.ONE);
        BigInteger percentQty = holdingPercentQuantity(
                event.getChannelId(),
                settings.dumpSellHoldingMinPercent(),
                settings.dumpSellHoldingMaxPercent()
        );
        BigInteger baseQty = percentQty.signum() > 0
                ? percentQty.min(stepQty.multiply(BigInteger.valueOf(2)))
                : stepQty;
        return jitterQuantity(baseQty, settings.dumpQuantityJitterMinPercent(), settings.dumpQuantityJitterMaxPercent())
                .min(held);
    }

    private BigInteger jitterQuantity(BigInteger quantity, int minPercent, int maxPercent) {
        if (quantity.signum() <= 0) {
            return BigInteger.ZERO;
        }
        int percent = randomInt(minPercent, maxPercent);
        return quantity.multiply(BigInteger.valueOf(percent))
                .divide(BigInteger.valueOf(100))
                .max(BigInteger.ONE);
    }

    private BigInteger capToSystemHolding(String channelId, BigInteger requestedQty) {
        return requestedQty.min(systemHolding(channelId));
    }

    private BigInteger systemHolding(String channelId) {
        BigInteger held = userShareRepository.findByUserIdAndStockChannelId(SYSTEM_USER_ID, channelId)
                .map(share -> share.getQuantity().setScale(0, RoundingMode.FLOOR).toBigInteger())
                .orElse(BigInteger.ZERO);
        return held;
    }

    private void submitSystemTrade(LiquidityEvent event, boolean buy, BigInteger qty, BigDecimal estimatedPrice, LocalDateTime now) {
        ensureSystemUser();
        TradeRequest req = new TradeRequest();
        req.setUserId(SYSTEM_USER_ID);
        req.setStreamerId(event.getChannelId());
        req.setType(buy ? "buy" : "sell");
        req.setQuantity(qty);
        req.setEstimatedPrice(estimatedPrice);
        req.setOrderMode("market");
        tradeEngine.submitTrade(req);
        new TransactionTemplate(txManager).executeWithoutResult(status ->
                liquidityEventRepository.findById(event.getId())
                        .ifPresent(e -> e.recordTrade(buy, new BigDecimal(qty), now)));
    }

    private void ensureSystemUser() {
        new TransactionTemplate(txManager).executeWithoutResult(status -> {
            User user = userRepository.findById(SYSTEM_USER_ID).orElse(null);
            if (user == null) {
                user = User.builder()
                        .id(SYSTEM_USER_ID)
                        .coinBalance(SYSTEM_BALANCE)
                        .displayName("Market Liquidity")
                        .rankingNicknamePublic(false)
                        .build();
                user.markAsBot();
                userRepository.save(user);
                return;
            }
            if (!user.isBot()) {
                user.markAsBot();
            }
            if (user.getCoinBalance() == null || user.getCoinBalance().compareTo(SYSTEM_BALANCE.divide(BigDecimal.TEN)) < 0) {
                user.updateBalance(SYSTEM_BALANCE);
            }
        });
    }

    private boolean roll(BigDecimal chancePercent) {
        if (chancePercent == null || chancePercent.compareTo(BigDecimal.ZERO) <= 0) {
            return false;
        }
        return BigDecimal.valueOf(ThreadLocalRandom.current().nextDouble(100))
                .compareTo(chancePercent) < 0;
    }

    private BigDecimal randomPercent(BigDecimal min, BigDecimal max) {
        BigDecimal safeMin = min != null ? min : BigDecimal.ZERO;
        BigDecimal safeMax = max != null && max.compareTo(safeMin) >= 0 ? max : safeMin;
        return safeMin.add(safeMax.subtract(safeMin)
                .multiply(BigDecimal.valueOf(ThreadLocalRandom.current().nextDouble())));
    }

    private int randomInt(int min, int max) {
        int safeMin = Math.max(1, min);
        int safeMax = Math.max(safeMin, max);
        return ThreadLocalRandom.current().nextInt(safeMin, safeMax + 1);
    }
}
