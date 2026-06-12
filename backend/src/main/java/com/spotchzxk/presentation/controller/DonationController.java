package com.spotchzxk.presentation.controller;

import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.application.PortfolioService;
import com.spotchzxk.application.TradeEngine;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

@RestController
@RequestMapping("/api/donate")
@RequiredArgsConstructor
public class DonationController {

    private static final BigDecimal MIN_DONATION = BigDecimal.valueOf(1_000);
    private static final BigDecimal MAX_DONATION = BigDecimal.valueOf(100_000_000);

    private final PortfolioService portfolioService;
    private final UserRepository userRepository;
    private final TradeEngine tradeEngine;
    private final TransactionTemplate transactionTemplate;

    @PostMapping
    public ResponseEntity<?> donate(
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal String uid) {
        if (uid == null || uid.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "로그인이 필요합니다."));
        }

        // Issue #29: body.get("amount")媛 null?대㈃ NullPointerException 諛쒖깮 ??紐낆떆??null 泥댄겕
        Object amountObj = body.get("amount");
        if (amountObj == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "금액을 올바르게 입력해주세요."));
        }
        BigDecimal amount;
        try {
            amount = new BigDecimal(amountObj.toString());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "금액을 올바르게 입력해주세요."));
        }

        if (amount.compareTo(MIN_DONATION) < 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "최소 후원 금액은 1,000원입니다."));
        }
        if (amount.compareTo(MAX_DONATION) > 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "최대 후원 금액은 1억원입니다."));
        }

        AtomicReference<Map<String, Object>> result = new AtomicReference<>();
        final BigDecimal finalAmount = amount;
        try {
            tradeEngine.runWithUserLock(uid, () -> result.set(transactionTemplate.execute(status ->
                    donateLocked(uid, finalAmount))));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
        return ResponseEntity.ok(result.get());
    }

    private Map<String, Object> donateLocked(String uid, BigDecimal amount) {
        User user = portfolioService.getOrCreate(uid);
        if (user.getCoinBalance().compareTo(amount) < 0) {
            throw new IllegalStateException("잔고가 부족합니다.");
        }

        if (userRepository.addToBalance(uid, amount.negate()) != 1) {
            throw new IllegalStateException("사용자를 찾을 수 없습니다.");
        }
        if (userRepository.addToDonationTotal(uid, amount) != 1) {
            throw new IllegalStateException("사용자를 찾을 수 없습니다.");
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                tradeEngine.evictUserCache(uid);
            }
        });

        User updated = userRepository.findById(uid)
                 .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));
        return Map.of(
                "balance", updated.getCoinBalance(),
                "donationTotal", updated.getDonationTotal()
        );
    }
}


