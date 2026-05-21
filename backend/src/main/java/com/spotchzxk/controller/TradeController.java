package com.spotchzxk.controller;

import com.spotchzxk.dto.TradeRequest;
import com.spotchzxk.dto.TradeResponse;
import com.spotchzxk.service.TradeEngine;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
public class TradeController {

    private final TradeEngine tradeEngine;

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("ok");
    }

    @PostMapping("/api/trade")
    public ResponseEntity<?> trade(@Valid @RequestBody TradeRequest req,
                                   @AuthenticationPrincipal String uid) {
        req.setUserId(uid);
        try {
            return ResponseEntity.ok(tradeEngine.submitTrade(req));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

}
