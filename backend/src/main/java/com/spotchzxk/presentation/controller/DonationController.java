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
            return ResponseEntity.badRequest().body(Map.of("error", "濡쒓렇?몄씠 ?꾩슂?⑸땲??"));
        }

        // Issue #29: body.get("amount")媛 null?대㈃ NullPointerException 諛쒖깮 ??紐낆떆??null 泥댄겕
        Object amountObj = body.get("amount");
        if (amountObj == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "?щ컮瑜?湲덉븸???낅젰?댁＜?몄슂."));
        }
        BigDecimal amount;
        try {
            amount = new BigDecimal(amountObj.toString());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "?щ컮瑜?湲덉븸???낅젰?댁＜?몄슂."));
        }

        if (amount.compareTo(MIN_DONATION) < 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "理쒖냼 ?꾩썝 湲덉븸? 1,000?먯엯?덈떎."));
        }
        if (amount.compareTo(MAX_DONATION) > 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "理쒕? ?꾩썝 湲덉븸? 1?듭썝?낅땲??"));
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
            throw new IllegalStateException("?붽퀬媛 遺議깊빀?덈떎.");
        }

        if (userRepository.addToBalance(uid, amount.negate()) != 1) {
            throw new IllegalStateException("?ъ슜?먮? 李얠쓣 ???놁뒿?덈떎.");
        }
        if (userRepository.addToDonationTotal(uid, amount) != 1) {
            throw new IllegalStateException("?ъ슜?먮? 李얠쓣 ???놁뒿?덈떎.");
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                tradeEngine.evictUserCache(uid);
            }
        });

        User updated = userRepository.findById(uid)
                .orElseThrow(() -> new IllegalStateException("?ъ슜?먮? 李얠쓣 ???놁뒿?덈떎."));
        return Map.of(
                "balance", updated.getCoinBalance(),
                "donationTotal", updated.getDonationTotal()
        );
    }
}


