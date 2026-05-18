package com.spotchzxk.controller;

import com.spotchzxk.service.PortfolioService;
import com.spotchzxk.service.TradeEngine;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class PortfolioController {

    private final PortfolioService portfolioService;
    private final TradeEngine tradeEngine;

    @GetMapping("/portfolio")
    public ResponseEntity<Map<String, Object>> getPortfolio(@AuthenticationPrincipal String uid) {
        return ResponseEntity.ok(portfolioService.getPortfolioResponse(uid));
    }

    @PostMapping("/portfolio/reset")
    public ResponseEntity<Map<String, Object>> resetPortfolio(@AuthenticationPrincipal String uid) {
        portfolioService.resetPortfolio(uid);
        tradeEngine.evictUserCache(uid);
        return ResponseEntity.ok(portfolioService.getPortfolioResponse(uid));
    }
}
