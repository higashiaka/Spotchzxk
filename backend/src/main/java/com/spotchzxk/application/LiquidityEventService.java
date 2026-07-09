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
import java.time.format.DateTimeParseException;
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
            "liquidity-events.dump-sell-holding-max-percent",
            "liquidity-events.accumulation-buy-chance-percent",
            "liquidity-events.pump-buy-chance-percent",
            "liquidity-events.climax-buy-chance-percent",
            "liquidity-events.global-trade-cooldown-min-seconds",
            "liquidity-events.global-trade-cooldown-max-seconds",
            "liquidity-events.idle-live-start-chance-percent",
            "liquidity-events.stock-budget-amount",
            "liquidity-events.stock-budget-refill-threshold"
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

    @Value("${liquidity-events.accumulation-buy-chance-percent:88}")
    private int defaultAccumulationBuyChancePercent;

    @Value("${liquidity-events.pump-buy-chance-percent:82}")
    private int defaultPumpBuyChancePercent;

    @Value("${liquidity-events.climax-buy-chance-percent:94}")
    private int defaultClimaxBuyChancePercent;

    @Value("${liquidity-events.global-trade-cooldown-min-seconds:30}")
    private int defaultGlobalTradeCooldownMinSeconds;

    @Value("${liquidity-events.global-trade-cooldown-max-seconds:90}")
    private int defaultGlobalTradeCooldownMaxSeconds;

    @Value("${liquidity-events.idle-live-start-chance-percent:1}")
    private BigDecimal defaultIdleLiveStartChancePercent;

    @Value("${liquidity-events.stock-budget-amount:500000000}")
    private BigDecimal defaultStockBudgetAmount;

    @Value("${liquidity-events.stock-budget-refill-threshold:50000000}")
    private BigDecimal defaultStockBudgetRefillThreshold;

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

    @Scheduled(fixedDelayString = "${liquidity-events.idle-live-scheduler-delay-ms:60000}")
    public void maybeStartForIdleLiveStocks() {
        LiquiditySettings settings = settings();
        if (!settings.enabled() || settings.idleLiveStartChancePercent().compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        try {
            stockRepository.findIdleLiveStocks().forEach(stock -> {
                if (!roll(settings.idleLiveStartChancePercent())) {
                    return;
                }
                try {
                    new TransactionTemplate(txManager).executeWithoutResult(status ->
                            startIfEligible(stock.getChannelId(), settings));
                } catch (RuntimeException e) {
                    log.debug("Idle live liquidity event start skipped for {}: {}",
                            stock.getChannelId(), e.getMessage());
                }
            });
        } catch (RuntimeException e) {
            log.warn("Idle live liquidity event scan failed", e);
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
        BigDecimal currentPrice = MarketPrice.spotPrice(stock);
        if (shouldAdvancePhase(event, currentPrice)) {
            if (event.getPhase() == LiquidityEventPhase.CLIMAX && !hasDumpInventory(event)) {
                log.info("Liquidity event cooldown without dump inventory: eventId={}, stock={}",
                        event.getId(), event.getChannelId());
                startCooldown(event.getId(), now);
                return;
            }
            advancePhase(event.getId(), event.getPhase(), now, settings);
            return;
        }

        boolean buy = shouldBuy(event.getPhase(), settings);
        BigInteger qty;
        if (buy) {
            qty = randomBuyQuantity(stock, settings);
            qty = capToStockBudget(event.getChannelId(), qty, currentPrice, now, settings);
        } else if (event.getPhase() == LiquidityEventPhase.DUMP) {
            qty = dumpStepQuantity(event, settings);
        } else {
            qty = holdingPercentQuantity(event.getChannelId(), settings.sellHoldingMinPercent(), settings.sellHoldingMaxPercent());
            if (qty.signum() <= 0) {
                buy = true;
                qty = randomBuyQuantity(stock, settings);
                qty = capToStockBudget(event.getChannelId(), qty, currentPrice, now, settings);
            }
        }
        if (!buy) {
            qty = capToSystemHolding(event.getChannelId(), qty);
        }
        if (qty.signum() <= 0) {
            if (event.getPhase() == LiquidityEventPhase.DUMP) {
                log.info("Liquidity event cooldown because dump inventory is empty: eventId={}, stock={}",
                        event.getId(), event.getChannelId());
                startCooldown(event.getId(), now);
            }
            return;
        }
        if (!reserveGlobalTradeSlot(now, settings)) {
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

    private boolean shouldAdvancePhase(LiquidityEvent event, BigDecimal currentPrice) {
        return switch (event.getPhase()) {
            case ACCUMULATION -> currentPrice.compareTo(accumulationTargetPrice(event)) >= 0;
            case PUMP -> currentPrice.compareTo(event.getTargetPeakPrice().multiply(new BigDecimal("0.86"))) >= 0;
            case CLIMAX -> currentPrice.compareTo(event.getTargetPeakPrice()) >= 0;
            case DUMP -> currentPrice.compareTo(event.getDumpTargetPrice()) <= 0
                    || event.getDumpTradeCount() >= event.getDumpSteps();
            default -> false;
        };
    }

    private BigDecimal accumulationTargetPrice(LiquidityEvent event) {
        BigDecimal quarterRise = event.getTargetPeakPrice()
                .subtract(event.getStartPrice())
                .multiply(new BigDecimal("0.25"));
        BigDecimal minimumRise = event.getStartPrice().multiply(new BigDecimal("0.08"));
        BigDecimal targetRise = quarterRise.max(minimumRise);
        return event.getStartPrice().add(targetRise).min(event.getTargetPeakPrice());
    }

    private boolean hasDumpInventory(LiquidityEvent event) {
        return event.getAccumulatedBuyQuantity() != null
                && event.getAccumulatedBuyQuantity().compareTo(BigDecimal.ZERO) > 0
                && systemHolding(event.getChannelId()).signum() > 0;
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
                appStateService.getInt("liquidity-events.dump-sell-holding-max-percent", defaultDumpSellHoldingMaxPercent),
                appStateService.getInt("liquidity-events.accumulation-buy-chance-percent", defaultAccumulationBuyChancePercent),
                appStateService.getInt("liquidity-events.pump-buy-chance-percent", defaultPumpBuyChancePercent),
                appStateService.getInt("liquidity-events.climax-buy-chance-percent", defaultClimaxBuyChancePercent),
                appStateService.getInt("liquidity-events.global-trade-cooldown-min-seconds", defaultGlobalTradeCooldownMinSeconds),
                appStateService.getInt("liquidity-events.global-trade-cooldown-max-seconds", defaultGlobalTradeCooldownMaxSeconds),
                appStateService.getDecimal("liquidity-events.idle-live-start-chance-percent", defaultIdleLiveStartChancePercent),
                appStateService.getDecimal("liquidity-events.stock-budget-amount", defaultStockBudgetAmount),
                appStateService.getDecimal("liquidity-events.stock-budget-refill-threshold", defaultStockBudgetRefillThreshold)
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
            int dumpSellHoldingMaxPercent,
            int accumulationBuyChancePercent,
            int pumpBuyChancePercent,
            int climaxBuyChancePercent,
            int globalTradeCooldownMinSeconds,
            int globalTradeCooldownMaxSeconds,
            BigDecimal idleLiveStartChancePercent,
            BigDecimal stockBudgetAmount,
            BigDecimal stockBudgetRefillThreshold
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
            int safeGlobalCooldownMin = Math.max(0, globalTradeCooldownMinSeconds);
            int safeGlobalCooldownMax = Math.max(safeGlobalCooldownMin, globalTradeCooldownMaxSeconds);
            BigDecimal safeMinRise = minRisePercent != null ? minRisePercent.max(BigDecimal.ZERO) : BigDecimal.ZERO;
            BigDecimal safeMaxRise = maxRisePercent != null && maxRisePercent.compareTo(safeMinRise) >= 0 ? maxRisePercent : safeMinRise;
            BigDecimal safeDumpRetain = dumpRetainPercent != null ? dumpRetainPercent.max(BigDecimal.ZERO) : BigDecimal.ZERO;
            BigDecimal safeIdleLiveStartChance = idleLiveStartChancePercent != null
                    ? idleLiveStartChancePercent.max(BigDecimal.ZERO)
                    : BigDecimal.ZERO;
            BigDecimal safeStockBudgetAmount = stockBudgetAmount != null
                    ? stockBudgetAmount.max(BigDecimal.ONE)
                    : BigDecimal.ONE;
            BigDecimal safeStockBudgetRefillThreshold = stockBudgetRefillThreshold != null
                    ? stockBudgetRefillThreshold.max(BigDecimal.ZERO).min(safeStockBudgetAmount)
                    : BigDecimal.ZERO;
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
                    safeDumpSellMax,
                    clampPercent(accumulationBuyChancePercent),
                    clampPercent(pumpBuyChancePercent),
                    clampPercent(climaxBuyChancePercent),
                    safeGlobalCooldownMin,
                    safeGlobalCooldownMax,
                    safeIdleLiveStartChance,
                    safeStockBudgetAmount,
                    safeStockBudgetRefillThreshold
            );
        }
    }

    private static int clampPercent(int value) {
        return Math.max(0, Math.min(100, value));
    }

    private boolean shouldBuy(LiquidityEventPhase phase, LiquiditySettings settings) {
        int n = ThreadLocalRandom.current().nextInt(100);
        return switch (phase) {
            case ACCUMULATION -> n < settings.accumulationBuyChancePercent();
            case PUMP -> n < settings.pumpBuyChancePercent();
            case CLIMAX -> n < settings.climaxBuyChancePercent();
            case DUMP -> false;
            default -> false;
        };
    }

    private boolean reserveGlobalTradeSlot(LocalDateTime now, LiquiditySettings settings) {
        if (settings.globalTradeCooldownMaxSeconds() <= 0) {
            return true;
        }
        String key = "liquidity-events.global-trade-cooldown-until";
        LocalDateTime cooldownUntil = appStateService.get(key)
                .flatMap(value -> {
                    try {
                        return java.util.Optional.of(LocalDateTime.parse(value.trim()));
                    } catch (DateTimeParseException e) {
                        return java.util.Optional.empty();
                    }
                })
                .orElse(null);
        if (cooldownUntil != null && cooldownUntil.isAfter(now)) {
            return false;
        }
        int cooldownSeconds = randomInt(
                settings.globalTradeCooldownMinSeconds(),
                settings.globalTradeCooldownMaxSeconds()
        );
        appStateService.put(key, now.plusSeconds(cooldownSeconds).toString());
        return true;
    }

    private BigInteger randomBuyQuantity(Stock stock, LiquiditySettings settings) {
        BigInteger requested = BigInteger.valueOf(randomInt(settings.buyQuantityMin(), settings.buyQuantityMax()));
        return requested.min(stock.getShareReserve()).max(BigInteger.ONE);
    }

    private BigInteger capToStockBudget(String channelId, BigInteger requestedQty, BigDecimal estimatedPrice,
                                        LocalDateTime now, LiquiditySettings settings) {
        if (requestedQty.signum() <= 0 || estimatedPrice == null || estimatedPrice.compareTo(BigDecimal.ZERO) <= 0) {
            return BigInteger.ZERO;
        }
        BigDecimal budget = stockBudget(channelId, now, settings);
        if (budget.compareTo(BigDecimal.ZERO) <= 0) {
            return BigInteger.ZERO;
        }
        BigInteger affordableQty = budget.divide(estimatedPrice, 0, RoundingMode.FLOOR).toBigInteger();
        return requestedQty.min(affordableQty);
    }

    private BigDecimal stockBudget(String channelId, LocalDateTime now, LiquiditySettings settings) {
        String budgetKey = stockBudgetKey(channelId);
        BigDecimal budget = appStateService.getDecimal(budgetKey, settings.stockBudgetAmount());
        if (budget.compareTo(settings.stockBudgetRefillThreshold()) > 0) {
            return budget.min(settings.stockBudgetAmount());
        }
        String refillKey = stockBudgetRefillKey(channelId);
        String today = LocalDate.now().toString();
        String lastRefill = appStateService.get(refillKey).orElse("");
        if (!today.equals(lastRefill)) {
            appStateService.put(budgetKey, settings.stockBudgetAmount().toPlainString());
            appStateService.put(refillKey, today);
            return settings.stockBudgetAmount();
        }
        return budget.max(BigDecimal.ZERO);
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
        adjustStockBudget(event.getChannelId(), buy, qty, estimatedPrice);
        new TransactionTemplate(txManager).executeWithoutResult(status ->
                liquidityEventRepository.findById(event.getId())
                        .ifPresent(e -> e.recordTrade(buy, new BigDecimal(qty), now)));
    }

    private void adjustStockBudget(String channelId, boolean buy, BigInteger qty, BigDecimal estimatedPrice) {
        BigDecimal tradeValue = estimatedPrice.multiply(new BigDecimal(qty)).setScale(0, RoundingMode.CEILING);
        String key = stockBudgetKey(channelId);
        LiquiditySettings settings = settings();
        BigDecimal current = appStateService.getDecimal(key, settings.stockBudgetAmount());
        BigDecimal next = buy
                ? current.subtract(tradeValue).max(BigDecimal.ZERO)
                : current.add(tradeValue).min(settings.stockBudgetAmount());
        appStateService.put(key, next.toPlainString());
    }

    private String stockBudgetKey(String channelId) {
        return "liquidity-events.stock-budget.remaining." + channelId;
    }

    private String stockBudgetRefillKey(String channelId) {
        return "liquidity-events.stock-budget.last-refill-date." + channelId;
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
