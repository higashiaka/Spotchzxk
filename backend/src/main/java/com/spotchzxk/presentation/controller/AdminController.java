package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.AmmMigrationService;
import com.spotchzxk.application.AdminUserService;
import com.spotchzxk.application.ChzzkLivePollingService;
import com.spotchzxk.application.DailyResetService;
import com.spotchzxk.application.LiquidityEventService;
import com.spotchzxk.application.StockSplitService;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigInteger;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AmmMigrationService ammMigrationService;
    private final ChzzkLivePollingService chzzkLivePollingService;
    private final DailyResetService dailyResetService;
    private final LiquidityEventService liquidityEventService;
    private final StockSplitService stockSplitService;
    private final AdminUserService adminUserService;
    private final StockRepository stockRepository;

    @PostMapping("/live-cache/refresh")
    public ResponseEntity<String> refreshLiveCache() {
        chzzkLivePollingService.initLiveStockCache();
        return ResponseEntity.ok("Live stock cache refreshed.");
    }

    @PostMapping("/stock-split/force")
    public ResponseEntity<String> forceStockSplit() {
        String result = stockSplitService.forcePerformSplit();
        return ResponseEntity.ok(result);
    }

    @PostMapping("/stock-reverse-split/force")
    public ResponseEntity<String> forceReverseStockSplit() {
        String result = stockSplitService.forcePerformReverseSplit();
        return ResponseEntity.ok(result);
    }

    @PostMapping("/amm/migrate")
    public ResponseEntity<String> migrateAmm() {
        ammMigrationService.migrateAll();
        return ResponseEntity.ok("AMM migration complete.");
    }

    @PostMapping("/daily-reset/force")
    public ResponseEntity<?> forceDailyReset() {
        int resetStocks = dailyResetService.forceDailyReset();
        return ResponseEntity.ok(Map.of("resetStocks", resetStocks));
    }

    @GetMapping("/liquidity-events/settings")
    public ResponseEntity<Map<String, String>> getLiquidityEventSettings() {
        return ResponseEntity.ok(liquidityEventService.currentSettings());
    }

    @PostMapping("/liquidity-events/settings")
    public ResponseEntity<?> updateLiquidityEventSettings(@RequestBody Map<String, Object> body) {
        if (body == null || body.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "settings body is required"));
        }
        try {
            body.forEach((key, value) -> {
                String settingKey = key.startsWith("liquidity-events.") ? key : "liquidity-events." + key;
                liquidityEventService.updateSetting(settingKey, String.valueOf(value));
            });
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
        return ResponseEntity.ok(liquidityEventService.currentSettings());
    }

    @PostMapping("/stocks/{channelId}/fix-amm")
    public ResponseEntity<String> fixAmmPool(
            @PathVariable String channelId,
            @RequestParam long targetPrice) {
        if (targetPrice <= 0) {
            return ResponseEntity.badRequest().body("targetPrice must be > 0");
        }
        Stock stock = stockRepository.findById(channelId).orElse(null);
        if (stock == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Stock not found: " + channelId);
        }
        BigInteger shareReserve = stock.getShareReserve();
        if (shareReserve.signum() <= 0) {
            return ResponseEntity.badRequest().body("shareReserve is 0 — run /amm/migrate instead");
        }
        BigInteger newCoinReserve = BigInteger.valueOf(targetPrice).multiply(shareReserve);
        stock.initAmmPool(newCoinReserve, shareReserve, stock.getLiquidityTier());
        stockRepository.save(stock);
        return ResponseEntity.ok(String.format("Fixed %s: price=%d, coinReserve=%s, shareReserve=%s",
                stock.getStreamerName(), targetPrice, newCoinReserve, shareReserve));
    }

    @PostMapping("/users/{userId}/suspend")
    public ResponseEntity<?> suspendUser(
            @PathVariable String userId,
            @RequestBody Map<String, Object> body) {
        String reason = String.valueOf(body.getOrDefault("reason", "")).trim();
        long durationHours = parseDurationHours(body.get("durationHours"));
        if (reason.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "reason is required"));
        }
        if (reason.length() > 255) {
            return ResponseEntity.badRequest().body(Map.of("error", "reason must be 255 chars or less"));
        }
        if (durationHours <= 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "durationHours must be > 0"));
        }
        Map<String, Object> result = adminUserService.suspendUser(userId, reason, durationHours);
        if (result == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "user not found"));
        }
        return ResponseEntity.ok(result);
    }

    @PostMapping("/users/{userId}/unsuspend")
    public ResponseEntity<?> unsuspendUser(@PathVariable String userId) {
        if (!adminUserService.unsuspendUser(userId)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "user not found"));
        }
        return ResponseEntity.ok(Map.of("userId", userId, "suspended", false));
    }

    private long parseDurationHours(Object raw) {
        if (raw instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(raw));
        } catch (Exception e) {
            return 0;
        }
    }
}
