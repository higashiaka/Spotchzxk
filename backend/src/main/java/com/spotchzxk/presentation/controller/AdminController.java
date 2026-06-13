package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.AmmMigrationService;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigInteger;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AmmMigrationService ammMigrationService;
    private final StockRepository stockRepository;

    @Value("${app.admin-api-key:}")
    private String adminApiKey;

    @PostMapping("/amm/migrate")
    public ResponseEntity<String> migrateAmm(
            @RequestHeader(value = "X-Admin-Key", required = false) String key) {
        if (adminApiKey.isBlank() || !adminApiKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        }
        ammMigrationService.migrateAll();
        return ResponseEntity.ok("AMM migration complete.");
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
}


