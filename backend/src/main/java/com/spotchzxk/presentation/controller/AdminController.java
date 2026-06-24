package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.AmmMigrationService;
import com.spotchzxk.application.ChzzkLivePollingService;
import com.spotchzxk.application.DailyResetService;
import com.spotchzxk.application.StockSplitService;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigInteger;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AmmMigrationService ammMigrationService;
    private final ChzzkLivePollingService chzzkLivePollingService;
    private final DailyResetService dailyResetService;
    private final StockSplitService stockSplitService;
    private final StockRepository stockRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @Value("${app.admin-api-key:}")
    private String adminApiKey;

    @PostMapping("/live-cache/refresh")
    public ResponseEntity<String> refreshLiveCache(
            @RequestHeader(value = "X-Admin-Key", required = false) String key) {
        if (adminApiKey.isBlank() || !adminApiKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        }
        chzzkLivePollingService.initLiveStockCache();
        return ResponseEntity.ok("Live stock cache refreshed.");
    }

    @PostMapping("/stock-split/force")
    public ResponseEntity<String> forceStockSplit(
            @RequestHeader(value = "X-Admin-Key", required = false) String key) {
        if (adminApiKey.isBlank() || !adminApiKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        }
        String result = stockSplitService.forcePerformSplit();
        return ResponseEntity.ok(result);
    }

    @PostMapping("/stock-reverse-split/force")
    public ResponseEntity<String> forceReverseStockSplit(
            @RequestHeader(value = "X-Admin-Key", required = false) String key) {
        if (adminApiKey.isBlank() || !adminApiKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        }
        String result = stockSplitService.forcePerformReverseSplit();
        return ResponseEntity.ok(result);
    }

    @PostMapping("/amm/migrate")
    public ResponseEntity<String> migrateAmm(
            @RequestHeader(value = "X-Admin-Key", required = false) String key) {
        if (adminApiKey.isBlank() || !adminApiKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        }
        ammMigrationService.migrateAll();
        return ResponseEntity.ok("AMM migration complete.");
    }

    @PostMapping("/daily-reset/force")
    public ResponseEntity<?> forceDailyReset(
            @RequestHeader(value = "X-Admin-Key", required = false) String key) {
        if (adminApiKey.isBlank() || !adminApiKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        }
        int resetStocks = dailyResetService.forceDailyReset();
        return ResponseEntity.ok(Map.of("resetStocks", resetStocks));
    }

    @PostMapping("/stocks/{channelId}/fix-amm")
    public ResponseEntity<String> fixAmmPool(
            @RequestHeader(value = "X-Admin-Key", required = false) String key,
            @PathVariable String channelId,
            @RequestParam long targetPrice) {
        if (adminApiKey.isBlank() || !adminApiKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        }
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

    @Transactional
    @PostMapping("/users/{userId}/suspend")
    public ResponseEntity<?> suspendUser(
            @RequestHeader(value = "X-Admin-Key", required = false) String key,
            @PathVariable String userId,
            @RequestBody Map<String, Object> body) {
        if (adminApiKey.isBlank() || !adminApiKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        }
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
        if (!userRepository.existsById(userId)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "user not found"));
        }
        LocalDateTime suspendedUntil = LocalDateTime.now(KST).plusHours(durationHours);
        userRepository.suspendUser(userId, reason, suspendedUntil);
        messagingTemplate.convertAndSend("/topic/user-suspension/" + userId,
                Map.of("suspended", true, "reason", reason, "suspendedUntil", suspendedUntil.toString()));
        return ResponseEntity.ok(Map.of(
                "userId", userId,
                "suspended", true,
                "reason", reason,
                "durationHours", durationHours,
                "suspendedUntil", suspendedUntil.toString()
        ));
    }

    @Transactional
    @PostMapping("/users/{userId}/unsuspend")
    public ResponseEntity<?> unsuspendUser(
            @RequestHeader(value = "X-Admin-Key", required = false) String key,
            @PathVariable String userId) {
        if (adminApiKey.isBlank() || !adminApiKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        }
        if (userRepository.clearSuspension(userId) != 1) {
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
