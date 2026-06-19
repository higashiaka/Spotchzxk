package com.spotchzxk.presentation.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.entity.CheerLog;
import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.repository.CheerLogRepository;
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
import java.math.BigInteger;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

@RestController
@RequestMapping("/api/donate")
@RequiredArgsConstructor
public class DonationController {

    private static final BigDecimal MIN_DONATION = BigDecimal.valueOf(1_000);
    private static final BigDecimal LIQUIDITY_SHARE = BigDecimal.valueOf(0.80);
    private final PortfolioService portfolioService;
    private final UserRepository userRepository;
    private final StockRepository stockRepository;
    private final CheerLogRepository cheerLogRepository;
    private final TradeEngine tradeEngine;
    private final TransactionTemplate transactionTemplate;

    @PostMapping
    public ResponseEntity<?> donate(
            @RequestBody JsonNode body,
            @AuthenticationPrincipal String uid) {
        if (uid == null || uid.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "로그인이 필요합니다."));
        }

        // Issue #29: body.get("amount") can be null — explicit null check before casting to avoid NPE
        JsonNode amountNode = body.get("amount");
        if (amountNode == null || amountNode.isNull()) {
            return ResponseEntity.badRequest().body(Map.of("error", "금액을 올바르게 입력해주세요."));
        }
        BigDecimal amount;
        try {
            amount = amountNode.isNumber()
                    ? amountNode.decimalValue()
                    : new BigDecimal(amountNode.asText());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "금액을 올바르게 입력해주세요."));
        }

        if (amount.compareTo(MIN_DONATION) < 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "최소 후원 금액은 1,000원입니다."));
        }
        if (amount.stripTrailingZeros().scale() > 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "후원 금액은 정수로 입력해주세요."));
        }
        JsonNode streamerIdNode = body.get("streamerId");
        String streamerId = streamerIdNode != null && streamerIdNode.isTextual()
                ? streamerIdNode.asText().trim()
                : "";
        AtomicReference<Map<String, Object>> result = new AtomicReference<>();
        final BigDecimal finalAmount = amount;
        final String finalStreamerId = streamerId;
        try {
            tradeEngine.runWithUserLock(uid, () -> {
                if (finalStreamerId.isBlank()) {
                    result.set(transactionTemplate.execute(status ->
                            donateLocked(uid, finalAmount, finalStreamerId)));
                } else {
                    tradeEngine.runWithStockLock(finalStreamerId, () -> result.set(transactionTemplate.execute(status ->
                            donateLocked(uid, finalAmount, finalStreamerId))));
                }
            });
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
        return ResponseEntity.ok(result.get());
    }

    private Map<String, Object> donateLocked(String uid, BigDecimal amount, String streamerId) {
        User user = portfolioService.getOrCreate(uid);
        if (user.getCoinBalance().compareTo(amount) < 0) {
            throw new IllegalStateException("잔고가 부족합니다.");
        }
        BigDecimal burnedCoins = amount.setScale(0, RoundingMode.UNNECESSARY);
        LiquiditySupport liquiditySupport = LiquiditySupport.empty();

        if (userRepository.addToBalance(uid, amount.negate()) != 1) {
            throw new IllegalStateException("사용자를 찾을 수 없습니다.");
        }
        if (userRepository.addToDonationTotal(uid, amount) != 1) {
            throw new IllegalStateException("사용자를 찾을 수 없습니다.");
        }
        if (!streamerId.isBlank()) {
            Stock stock = stockRepository.findByIdForUpdate(streamerId)
                    .orElseThrow(() -> new IllegalStateException("종목을 찾을 수 없습니다."));
            liquiditySupport = applyDonationLiquidity(stock, amount);
            cheerLogRepository.save(CheerLog.builder()
                    .userId(uid)
                    .stockId(streamerId)
                    .burnedCoins(burnedCoins)
                    .createdAt(LocalDateTime.now())
                    .build());
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                tradeEngine.evictUserCache(uid);
                if (!streamerId.isBlank()) {
                    tradeEngine.evictStockCache(streamerId);
                }
            }
        });

        User updated = userRepository.findById(uid)
                 .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));
        return Map.of(
                "balance", updated.getCoinBalance(),
                "donationTotal", updated.getDonationTotal(),
                "streamerId", streamerId,
                "liquidityCoinAdded", liquiditySupport.coinAdded(),
                "liquidityShareAdded", liquiditySupport.shareAdded(),
                "feePoolAdded", liquiditySupport.feePoolAdded()
        );
    }

    private LiquiditySupport applyDonationLiquidity(Stock stock, BigDecimal amount) {
        BigInteger coinReserve = stock.getCoinReserve();
        BigInteger shareReserve = stock.getShareReserve();
        if (coinReserve == null || shareReserve == null || coinReserve.signum() <= 0 || shareReserve.signum() <= 0) {
            return LiquiditySupport.empty();
        }

        BigInteger liquidityCoin = amount.multiply(LIQUIDITY_SHARE)
                .setScale(0, RoundingMode.DOWN)
                .toBigIntegerExact();
        BigInteger feePoolAmount = amount.toBigIntegerExact().subtract(liquidityCoin).max(BigInteger.ZERO);
        if (liquidityCoin.signum() <= 0) {
            return LiquiditySupport.empty();
        }

        BigInteger liquidityShare = new BigDecimal(liquidityCoin)
                .multiply(new BigDecimal(shareReserve))
                .divide(new BigDecimal(coinReserve), 0, RoundingMode.HALF_UP)
                .toBigIntegerExact();
        if (liquidityShare.signum() <= 0) {
            liquidityShare = BigInteger.ONE;
        }

        stock.addBalancedLiquidity(liquidityCoin, liquidityShare, feePoolAmount);
        stockRepository.save(stock);
        return new LiquiditySupport(liquidityCoin, liquidityShare, feePoolAmount);
    }

    private record LiquiditySupport(BigInteger coinAdded, BigInteger shareAdded, BigInteger feePoolAdded) {
        private static LiquiditySupport empty() {
            return new LiquiditySupport(BigInteger.ZERO, BigInteger.ZERO, BigInteger.ZERO);
        }
    }
}


