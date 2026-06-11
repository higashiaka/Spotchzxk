package com.spotchzxk.domain.trading.service;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;

/**
 * x * y = k AMM 怨꾩궛 ?좏떥由ы떚.
 * 紐⑤뱺 湲덉븸 ?⑥쐞????long). overflow 諛⑹?瑜??꾪빐 ?대??곸쑝濡?BigInteger ?ъ슜.
 */
public final class AmmCalculator {

    static final double FEE_RATE        = 0.015;  // 珥??섏닔猷뚯쑉 1.5%
    static final double FEE_POOL_RATIO  = 2.0 / 3.0; // 1% ??fee_pool, 0.5% ???뚭컖

    private AmmCalculator() {}

    /**
     * qty二?留ㅼ닔 ??AMM ??먯꽌 鍮좎졇?섍???肄붿씤 (?섏닔猷??쒖쇅).
     * cost = coinReserve * qty / (shareReserve - qty)
     */
    public static long buyCost(long coinReserve, long shareReserve, long qty) {
        if (coinReserve <= 0) throw new IllegalStateException("AMM ???珥덇린?붾릺吏 ?딆? 醫낅ぉ?낅땲?? ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.");
        if (qty <= 0) throw new IllegalStateException("二쇰Ц ?섎웾? 1二??댁긽?댁뼱???⑸땲??");
        if (qty >= shareReserve) throw new IllegalStateException("二쇰Ц ?섎웾??AMM ????좊룞?깆쓣 珥덇낵?⑸땲?? ?섎웾??以꾩뿬二쇱꽭??");
        BigInteger num = BigInteger.valueOf(coinReserve).multiply(BigInteger.valueOf(qty));
        BigInteger den = BigInteger.valueOf(shareReserve - qty);
        // ?щ┝ 泥섎━ (?좎?媛 議곌툑 ???대룄濡?
        BigInteger[] qr = num.divideAndRemainder(den);
        try {
            long result = qr[0].longValueExact();
            return qr[1].signum() > 0 ? result + 1 : result;
        } catch (ArithmeticException e) {
            throw new IllegalStateException("嫄곕옒 湲덉븸???덈Т ?쎈땲?? ?섎웾??以꾩뿬二쇱꽭??");
        }
    }

    /**
     * qty二?留ㅻ룄 ??AMM ??먯꽌 ?좎??먭쾶 ?섍???肄붿씤 (?섏닔猷??쒖쇅).
     * revenue = coinReserve * qty / (shareReserve + qty)
     */
    public static long sellRevenue(long coinReserve, long shareReserve, long qty) {
        if (coinReserve <= 0) throw new IllegalStateException("AMM ???珥덇린?붾릺吏 ?딆? 醫낅ぉ?낅땲?? ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.");
        if (qty <= 0) throw new IllegalStateException("二쇰Ц ?섎웾? 1二??댁긽?댁뼱???⑸땲??");
        BigInteger num = BigInteger.valueOf(coinReserve).multiply(BigInteger.valueOf(qty));
        BigInteger den = BigInteger.valueOf(shareReserve + qty);
        try {
            return num.divide(den).longValueExact(); // ?대┝ (?좎?媛 議곌툑 ??諛쏅룄濡?
        } catch (ArithmeticException e) {
            throw new IllegalStateException("嫄곕옒 湲덉븸???덈Т ?쎈땲?? ?섎웾??以꾩뿬二쇱꽭??");
        }
    }

    /** ?섏닔猷?怨꾩궛: {feePoolAmount, burnAmount} */
    public static long[] fee(long ammAmount) {
        long total = (long) Math.ceil(ammAmount * FEE_RATE);
        long poolShare = total * 2 / 3; // ?뺤닔 ?곗궛?쇰줈 2/3 ?뺥솗??怨꾩궛
        return new long[]{poolShare, total - poolShare};
    }

    /** 留ㅼ닔 ????? ?곹깭 */
    public static long[] newPoolAfterBuy(long coinReserve, long shareReserve, long qty, long ammCost) {
        return new long[]{coinReserve + ammCost, shareReserve - qty};
    }

    /** 留ㅻ룄 ????? ?곹깭 */
    public static long[] newPoolAfterSell(long coinReserve, long shareReserve, long qty, long ammRevenue) {
        return new long[]{coinReserve - ammRevenue, shareReserve + qty};
    }

    /** ?꾩옱 AMM 媛寃?(coinReserve / shareReserve) */
    public static BigDecimal price(long coinReserve, long shareReserve) {
        if (shareReserve <= 0) throw new IllegalStateException("AMM ???珥덇린?붾릺吏 ?딆? 醫낅ぉ?낅땲?? ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.");
        return BigDecimal.valueOf(coinReserve)
                .divide(BigDecimal.valueOf(shareReserve), 0, RoundingMode.HALF_UP);
    }

    /** ?됯퇏 泥닿껐媛 = 珥?肄붿씤 / ?섎웾 */
    public static BigDecimal avgPrice(long coinAmount, long qty) {
        return BigDecimal.valueOf(coinAmount)
                .divide(BigDecimal.valueOf(qty), 0, RoundingMode.HALF_UP);
    }

    public record AmmResult(
        long ammAmount,
        long feePoolAmount,
        long burnAmount,
        long userNetAmount,
        long[] newPool,
        BigDecimal avgPrice,
        BigDecimal newPrice
    ) {}

    public static AmmResult calcBuy(long coinReserve, long shareReserve, long qty) {
        long ammCost = buyCost(coinReserve, shareReserve, qty);
        long[] fee = fee(ammCost);
        long userPays = ammCost + fee[0] + fee[1];
        long[] newPool = newPoolAfterBuy(coinReserve, shareReserve, qty, ammCost);
        return new AmmResult(
            ammCost, fee[0], fee[1], userPays,
            newPool,
            // Issue #9: userPays 湲곗??쇰줈 ?됯퇏媛 怨꾩궛 ??ammCost???섏닔猷??쒖쇅 湲덉븸?대씪 ?ㅼ젣 吏遺덉븸蹂대떎 1.5% ??쓬
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


