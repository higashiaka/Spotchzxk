package com.spotchzxk.controller;

import com.spotchzxk.service.AmmMigrationService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AmmMigrationService ammMigrationService;

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
}
