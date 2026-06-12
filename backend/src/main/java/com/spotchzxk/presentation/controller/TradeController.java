package com.spotchzxk.presentation.controller;

import com.spotchzxk.presentation.dto.TradeRequest;
import com.spotchzxk.presentation.dto.TradeResponse;
import com.spotchzxk.application.TradeEngine;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@Slf4j
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
        } catch (Exception e) {
            log.error("Trade error: user={}, stock={}, type={}", uid, req.getStreamerId(), req.getType(), e);
            return ResponseEntity.internalServerError().body(Map.of("error", "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."));
        }
    }

    @PostMapping("/api/trade/cancel")
    public ResponseEntity<?> cancel(@RequestParam("orderId") String orderId,
                                    @AuthenticationPrincipal String uid) {
        try {
            return ResponseEntity.ok(tradeEngine.cancelLimitOrder(uid, orderId));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}


