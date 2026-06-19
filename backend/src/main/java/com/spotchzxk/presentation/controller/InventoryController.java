package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.InventoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/inventory")
@RequiredArgsConstructor
public class InventoryController {

    private final InventoryService inventoryService;

    @GetMapping
    public ResponseEntity<?> getInventory(@AuthenticationPrincipal String uid) {
        if (uid == null || uid.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "로그인이 필요합니다."));
        }
        return ResponseEntity.ok(inventoryService.getInventory(uid));
    }

    @PostMapping("/selected-title")
    public ResponseEntity<?> selectTitle(
            @AuthenticationPrincipal String uid,
            @RequestBody Map<String, Object> body
    ) {
        if (uid == null || uid.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "로그인이 필요합니다."));
        }
        Object raw = body.get("titleId");
        Long titleId = null;
        if (raw != null && !raw.toString().isBlank()) {
            try {
                titleId = Long.parseLong(raw.toString());
            } catch (NumberFormatException e) {
                return ResponseEntity.badRequest().body(Map.of("error", "칭호 ID가 올바르지 않습니다."));
            }
        }
        try {
            return ResponseEntity.ok(inventoryService.selectTitle(uid, titleId));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
