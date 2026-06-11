package com.spotchzxk.service;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;

/**
 * x * y = k AMM 계산 유틸리티.
 * 모든 금액 단위는 원(long). overflow 방지를 위해 내부적으로 BigInteger 사용.
 */
public final class AmmCalculator {

    static final double FEE_RATE        = 0.015;  // 총 수수료율 1.5%
    static final double FEE_POOL_RATIO  = 2.0 / 3.0; // 1% → fee_pool, 0.5% → 소각

    private AmmCalculator() {}

    /**
     * qty주 매수 시 AMM 풀에서 빠져나가는 코인 (수수료 제외).
     * cost = coinReserve * qty / (shareReserve - qty)
     */
    public static long buyCost(long coinReserve, long shareReserve, long qty) {
        if (coinReserve <= 0) throw new IllegalStateException("AMM 풀이 초기화되지 않은 종목입니다. 잠시 후 다시 시도해주세요.");
        if (qty <= 0) throw new IllegalStateException("주문 수량은 1주 이상이어야 합니다.");
        if (qty >= shareReserve) throw new IllegalStateException("주문 수량이 AMM 풀의 유동성을 초과합니다. 수량을 줄여주세요.");
        BigInteger num = BigInteger.valueOf(coinReserve).multiply(BigInteger.valueOf(qty));
        BigInteger den = BigInteger.valueOf(shareReserve - qty);
        // 올림 처리 (유저가 조금 더 내도록)
        BigInteger[] qr = num.divideAndRemainder(den);
        try {
            long result = qr[0].longValueExact();
            return qr[1].signum() > 0 ? result + 1 : result;
        } catch (ArithmeticException e) {
            throw new IllegalStateException("거래 금액이 너무 큽니다. 수량을 줄여주세요.");
        }
    }

    /**
     * qty주 매도 시 AMM 풀에서 유저에게 나가는 코인 (수수료 제외).
     * revenue = coinReserve * qty / (shareReserve + qty)
     */
    public static long sellRevenue(long coinReserve, long shareReserve, long qty) {
        if (coinReserve <= 0) throw new IllegalStateException("AMM 풀이 초기화되지 않은 종목입니다. 잠시 후 다시 시도해주세요.");
        if (qty <= 0) throw new IllegalStateException("주문 수량은 1주 이상이어야 합니다.");
        BigInteger num = BigInteger.valueOf(coinReserve).multiply(BigInteger.valueOf(qty));
        BigInteger den = BigInteger.valueOf(shareReserve + qty);
        try {
            return num.divide(den).longValueExact(); // 내림 (유저가 조금 덜 받도록)
        } catch (ArithmeticException e) {
            throw new IllegalStateException("거래 금액이 너무 큽니다. 수량을 줄여주세요.");
        }
    }

    /** 수수료 계산: {feePoolAmount, burnAmount} */
    public static long[] fee(long ammAmount) {
        long total = (long) Math.ceil(ammAmount * FEE_RATE);
        long poolShare = total * 2 / 3; // 정수 연산으로 2/3 정확히 계산
        return new long[]{poolShare, total - poolShare};
    }

    /** 매수 후 새 풀 상태 */
    public static long[] newPoolAfterBuy(long coinReserve, long shareReserve, long qty, long ammCost) {
        return new long[]{coinReserve + ammCost, shareReserve - qty};
    }

    /** 매도 후 새 풀 상태 */
    public static long[] newPoolAfterSell(long coinReserve, long shareReserve, long qty, long ammRevenue) {
        return new long[]{coinReserve - ammRevenue, shareReserve + qty};
    }

    /** 현재 AMM 가격 (coinReserve / shareReserve) */
    public static BigDecimal price(long coinReserve, long shareReserve) {
        if (shareReserve <= 0) throw new IllegalStateException("AMM 풀이 초기화되지 않은 종목입니다. 잠시 후 다시 시도해주세요.");
        return BigDecimal.valueOf(coinReserve)
                .divide(BigDecimal.valueOf(shareReserve), 0, RoundingMode.HALF_UP);
    }

    /** 평균 체결가 = 총 코인 / 수량 */
    public static BigDecimal avgPrice(long coinAmount, long qty) {
        return BigDecimal.valueOf(coinAmount)
                .divide(BigDecimal.valueOf(qty), 0, RoundingMode.HALF_UP);
    }

    public record AmmResult(
        long ammAmount,          // 풀에 들어가거나 나오는 코인 (fee 제외)
        long feePoolAmount,      // fee_pool에 적립될 금액
        long burnAmount,         // 소각될 금액
        long userNetAmount,      // 유저가 실제 지불하거나 수령하는 코인
        long[] newPool,          // {newCoinReserve, newShareReserve}
        BigDecimal avgPrice,     // 평균 체결가
        BigDecimal newPrice      // 거래 후 AMM 가격
    ) {}

    public static AmmResult calcBuy(long coinReserve, long shareReserve, long qty) {
        long ammCost = buyCost(coinReserve, shareReserve, qty);
        long[] fee = fee(ammCost);
        long userPays = ammCost + fee[0] + fee[1];
        long[] newPool = newPoolAfterBuy(coinReserve, shareReserve, qty, ammCost);
        return new AmmResult(
            ammCost, fee[0], fee[1], userPays,
            newPool,
            // Issue #9: userPays 기준으로 평균가 계산 — ammCost는 수수료 제외 금액이라 실제 지불액보다 1.5% 낮음
            avgPrice(userPays, qty),
            price(newPool[0], newPool[1])
        );
    }

    public static AmmResult calcSell(long coinReserve, long shareReserve, long qty) {
        long ammRevenue = sellRevenue(coinReserve, shareReserve, qty);
        long[] fee = fee(ammRevenue);
        long userReceives = ammRevenue - fee[0] - fee[1];
        long[] newPool = newPoolAfterSell(coinReserve, shareReserve, qty, ammRevenue);
        return new AmmResult(
            ammRevenue, fee[0], fee[1], userReceives,
            newPool,
            avgPrice(userReceives, qty),
            price(newPool[0], newPool[1])
        );
    }
}
