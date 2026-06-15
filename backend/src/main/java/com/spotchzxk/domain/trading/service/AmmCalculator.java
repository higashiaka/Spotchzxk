package com.spotchzxk.domain.trading.service;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;

/**
 * x * y = k AMM calculation utility.
 * All pool and coin amounts are integer coin units.
 */
public final class AmmCalculator {

    private static final BigInteger FEE_RATE_NUMERATOR = BigInteger.valueOf(15);
    private static final BigInteger FEE_RATE_DENOMINATOR = BigInteger.valueOf(1000);
    private static final int PRICE_SCALE = 6;

    private AmmCalculator() {}

    /**
     * qty二?留ㅼ닔 ??AMM ??먯꽌 鍮좎졇?섍???肄붿씤 (?섏닔猷??쒖쇅).
     * cost = coinReserve * qty / (shareReserve - qty)
     */
    public static BigInteger buyCost(BigInteger coinReserve, BigInteger shareReserve, long qty) {
        if (coinReserve.signum() <= 0) throw new IllegalStateException("AMM 풀이 초기화되지 않은 종목입니다. 잠시 후 다시 시도해주세요.");
        if (qty <= 0) throw new IllegalStateException("주문 수량은 1주 이상이어야 합니다.");
        BigInteger qtyValue = BigInteger.valueOf(qty);
        if (qtyValue.compareTo(shareReserve) >= 0) throw new IllegalStateException("주문 수량이 AMM 풀 유동성을 초과합니다. 수량을 줄여주세요.");
        BigInteger num = coinReserve.multiply(qtyValue);
        BigInteger den = shareReserve.subtract(qtyValue);
        // Ceiling division: round up so the pool never loses value on a buy
        BigInteger[] qr = num.divideAndRemainder(den);
        return qr[1].signum() > 0 ? qr[0].add(BigInteger.ONE) : qr[0];
    }

    /**
     * qty二?留ㅻ룄 ??AMM ??먯꽌 ?좎??먭쾶 ?섍???肄붿씤 (?섏닔猷??쒖쇅).
     * revenue = coinReserve * qty / (shareReserve + qty)
     */
    public static BigInteger sellRevenue(BigInteger coinReserve, BigInteger shareReserve, long qty) {
        if (coinReserve.signum() <= 0) throw new IllegalStateException("AMM 풀이 초기화되지 않은 종목입니다. 잠시 후 다시 시도해주세요.");
        if (qty <= 0) throw new IllegalStateException("주문 수량은 1주 이상이어야 합니다.");
        BigInteger num = coinReserve.multiply(BigInteger.valueOf(qty));
        BigInteger den = shareReserve.add(BigInteger.valueOf(qty));
        return num.divide(den);
    }

    /** ?섏닔猷?怨꾩궛: {feePoolAmount, burnAmount} */
    public static BigInteger[] fee(BigInteger ammAmount) {
        BigInteger total = ceilDiv(ammAmount.multiply(FEE_RATE_NUMERATOR), FEE_RATE_DENOMINATOR);
        // Integer arithmetic for 2/3 split; remainder goes to burn
        BigInteger poolShare = total.multiply(BigInteger.TWO).divide(BigInteger.valueOf(3));
        return new BigInteger[]{poolShare, total.subtract(poolShare)};
    }

    /** 留ㅼ닔 ????? ?곹깭 */
    public static BigInteger[] newPoolAfterBuy(BigInteger coinReserve, BigInteger shareReserve, long qty, BigInteger ammCost) {
        return new BigInteger[]{coinReserve.add(ammCost), shareReserve.subtract(BigInteger.valueOf(qty))};
    }

    /** 留ㅻ룄 ????? ?곹깭 */
    public static BigInteger[] newPoolAfterSell(BigInteger coinReserve, BigInteger shareReserve, long qty, BigInteger ammRevenue) {
        return new BigInteger[]{coinReserve.subtract(ammRevenue), shareReserve.add(BigInteger.valueOf(qty))};
    }

    /** Current AMM spot price (coinReserve / shareReserve) */
    public static BigDecimal price(BigInteger coinReserve, BigInteger shareReserve) {
        if (shareReserve.signum() <= 0) throw new IllegalStateException("AMM 풀이 초기화되지 않은 종목입니다. 잠시 후 다시 시도해주세요.");
        return new BigDecimal(coinReserve).divide(new BigDecimal(shareReserve), PRICE_SCALE, RoundingMode.HALF_UP);
    }

    /** ?됯퇏 泥닿껐媛 = 珥?肄붿씤 / ?섎웾 */
    public static BigDecimal avgPrice(BigInteger coinAmount, long qty) {
        return new BigDecimal(coinAmount)
                .divide(BigDecimal.valueOf(qty), PRICE_SCALE, RoundingMode.HALF_UP);
    }

    public record AmmResult(
        BigInteger ammAmount,
        BigInteger feePoolAmount,
        BigInteger burnAmount,
        BigInteger userNetAmount,
        BigInteger[] newPool,
        BigDecimal avgPrice,
        BigDecimal newPrice
    ) {}

    public static AmmResult calcBuy(BigInteger coinReserve, BigInteger shareReserve, long qty) {
        BigInteger ammCost = buyCost(coinReserve, shareReserve, qty);
        BigInteger[] fee = fee(ammCost);
        BigInteger userPays = ammCost.add(fee[0]).add(fee[1]);
        BigInteger[] newPool = newPoolAfterBuy(coinReserve, shareReserve, qty, ammCost);
        return new AmmResult(
            ammCost, fee[0], fee[1], userPays,
            newPool,
        // Issue #9: avgPrice is computed from userPays (not ammCost) because the 1.5% fee is included in what the user actually pays
            avgPrice(userPays, qty),
            price(newPool[0], newPool[1])
        );
    }

    public static AmmResult calcSell(BigInteger coinReserve, BigInteger shareReserve, long qty) {
        BigInteger ammRevenue = sellRevenue(coinReserve, shareReserve, qty);
        BigInteger[] fee = fee(ammRevenue);
        BigInteger userReceives = ammRevenue.subtract(fee[0]).subtract(fee[1]);
        BigInteger[] newPool = newPoolAfterSell(coinReserve, shareReserve, qty, ammRevenue);
        return new AmmResult(
            ammRevenue, fee[0], fee[1], userReceives,
            newPool,
            avgPrice(userReceives, qty),
            price(newPool[0], newPool[1])
        );
    }

    private static BigInteger ceilDiv(BigInteger numerator, BigInteger denominator) {
        BigInteger[] qr = numerator.divideAndRemainder(denominator);
        return qr[1].signum() > 0 ? qr[0].add(BigInteger.ONE) : qr[0];
    }
}


