package com.spotchzxk.controller;

import com.spotchzxk.entity.User;
import com.spotchzxk.repository.UserRepository;
import com.spotchzxk.service.PortfolioService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

@RestController
@RequestMapping("/api/donate")
@RequiredArgsConstructor
public class DonationController {

    private static final BigDecimal MIN_DONATION = BigDecimal.valueOf(1_000);
    private static final BigDecimal MAX_DONATION = BigDecimal.valueOf(100_000_000);

    private final PortfolioService portfolioService;
    private final UserRepository userRepository;

    @PostMapping
    @Transactional
    public ResponseEntity<?> donate(
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal String uid) {
        if (uid == null || uid.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "로그인이 필요합니다."));
        }

        BigDecimal amount;
        try {
            amount = new BigDecimal(body.get("amount").toString());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "올바른 금액을 입력해주세요."));
        }

        if (amount.compareTo(MIN_DONATION) < 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "최소 후원 금액은 1,000원입니다."));
        }
        if (amount.compareTo(MAX_DONATION) > 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "최대 후원 금액은 1억원입니다."));
        }

        User user = portfolioService.getOrCreate(uid);
        if (user.getCoinBalance().compareTo(amount) < 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "잔고가 부족합니다."));
        }

        user.addDonation(amount);
        userRepository.save(user);

        return ResponseEntity.ok(Map.of(
                "balance", user.getCoinBalance(),
                "donationTotal", user.getDonationTotal()
        ));
    }
}
