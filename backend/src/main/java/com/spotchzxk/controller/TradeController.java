package com.spotchzxk.controller;

import com.spotchzxk.dto.TradeRequest;
import com.spotchzxk.dto.TradeResponse;
import com.spotchzxk.service.TradeEngine;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class TradeController {

    private final TradeEngine tradeEngine;

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("ok");
    }

    @PostMapping("/api/trade")
    public ResponseEntity<TradeResponse> trade(@Valid @RequestBody TradeRequest req,
                                               @AuthenticationPrincipal String uid) {
        req.setUserId(uid);
        TradeResponse response = tradeEngine.submitTrade(req);
        return ResponseEntity.ok(response);
    }
}
