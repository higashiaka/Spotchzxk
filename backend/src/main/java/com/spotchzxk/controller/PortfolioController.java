package com.spotchzxk.controller;

import com.spotchzxk.exception.ResetLimitExceededException;
import com.spotchzxk.service.PortfolioService;
import com.spotchzxk.service.TradeEngine;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class PortfolioController {

    private final PortfolioService portfolioService;
    private final TradeEngine tradeEngine;

    @GetMapping("/portfolio")
    public ResponseEntity<Map<String, Object>> getPortfolio(@AuthenticationPrincipal String uid) {
        Map<String, Object> body = new HashMap<>(portfolioService.getPortfolioResponse(uid));
        body.put("remainingResets", portfolioService.getRemainingResets(uid));
        return ResponseEntity.ok(body);
    }

    @PostMapping("/portfolio/reset")
    public ResponseEntity<Map<String, Object>> resetPortfolio(@AuthenticationPrincipal String uid) {
        try {
            portfolioService.resetPortfolio(uid);
            tradeEngine.evictUserCache(uid);
            Map<String, Object> body = new HashMap<>(portfolioService.getPortfolioResponse(uid));
            body.put("remainingResets", portfolioService.getRemainingResets(uid));
            return ResponseEntity.ok(body);
        } catch (ResetLimitExceededException e) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("error", e.getMessage(), "remainingResets", 0));
        }
    }
}
