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

    public static BigInteger buyCost(BigInteger coinReserve, BigInteger shareReserve, long qty) {
        return buyCost(coinReserve, shareReserve, BigInteger.valueOf(qty));
    }

    public static BigInteger buyCost(BigInteger coinReserve, BigInteger shareReserve, BigInteger qty) {
        validatePoolAndQty(coinReserve, shareReserve, qty);
        if (qty.compareTo(shareReserve) >= 0) {
            throw new IllegalStateException("주문 수량이 AMM 유동성을 초과합니다. 수량을 줄여주세요.");
        }
        BigInteger num = coinReserve.multiply(qty);
        BigInteger den = shareReserve.subtract(qty);
        BigInteger[] qr = num.divideAndRemainder(den);
        return qr[1].signum() > 0 ? qr[0].add(BigInteger.ONE) : qr[0];
    }

    public static BigInteger sellRevenue(BigInteger coinReserve, BigInteger shareReserve, long qty) {
        return sellRevenue(coinReserve, shareReserve, BigInteger.valueOf(qty));
    }

    public static BigInteger sellRevenue(BigInteger coinReserve, BigInteger shareReserve, BigInteger qty) {
        validatePoolAndQty(coinReserve, shareReserve, qty);
        BigInteger num = coinReserve.multiply(qty);
        BigInteger den = shareReserve.add(qty);
        return num.divide(den);
    }

    public static BigInteger[] fee(BigInteger ammAmount) {
        BigInteger total = ceilDiv(ammAmount.multiply(FEE_RATE_NUMERATOR), FEE_RATE_DENOMINATOR);
        BigInteger poolShare = total.multiply(BigInteger.TWO).divide(BigInteger.valueOf(3));
        return new BigInteger[]{poolShare, total.subtract(poolShare)};
    }

    public static BigInteger[] newPoolAfterBuy(BigInteger coinReserve, BigInteger shareReserve, long qty, BigInteger ammCost) {
        return newPoolAfterBuy(coinReserve, shareReserve, BigInteger.valueOf(qty), ammCost);
    }

    public static BigInteger[] newPoolAfterBuy(BigInteger coinReserve, BigInteger shareReserve, BigInteger qty, BigInteger ammCost) {
        return new BigInteger[]{coinReserve.add(ammCost), shareReserve.subtract(qty)};
    }

    public static BigInteger[] newPoolAfterSell(BigInteger coinReserve, BigInteger shareReserve, long qty, BigInteger ammRevenue) {
        return newPoolAfterSell(coinReserve, shareReserve, BigInteger.valueOf(qty), ammRevenue);
    }

    public static BigInteger[] newPoolAfterSell(BigInteger coinReserve, BigInteger shareReserve, BigInteger qty, BigInteger ammRevenue) {
        return new BigInteger[]{coinReserve.subtract(ammRevenue), shareReserve.add(qty)};
    }

    public static BigDecimal price(BigInteger coinReserve, BigInteger shareReserve) {
        if (coinReserve == null || shareReserve == null
                || coinReserve.signum() <= 0 || shareReserve.signum() <= 0) {
            throw new IllegalStateException("AMM 풀이 초기화되지 않은 종목입니다. 잠시 후 다시 시도해주세요.");
        }
        return new BigDecimal(coinReserve).divide(new BigDecimal(shareReserve), PRICE_SCALE, RoundingMode.HALF_UP);
    }

    public static BigDecimal avgPrice(BigInteger coinAmount, long qty) {
        return avgPrice(coinAmount, BigInteger.valueOf(qty));
    }

    public static BigDecimal avgPrice(BigInteger coinAmount, BigInteger qty) {
        if (coinAmount == null || qty == null || qty.signum() <= 0) {
            throw new IllegalStateException("주문 수량은 1주 이상이어야 합니다.");
        }
        return new BigDecimal(coinAmount).divide(new BigDecimal(qty), PRICE_SCALE, RoundingMode.HALF_UP);
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
        return calcBuy(coinReserve, shareReserve, BigInteger.valueOf(qty));
    }

    public static AmmResult calcBuy(BigInteger coinReserve, BigInteger shareReserve, BigInteger qty) {
        BigInteger ammCost = buyCost(coinReserve, shareReserve, qty);
        BigInteger[] fee = fee(ammCost);
        BigInteger userPays = ammCost.add(fee[0]).add(fee[1]);
        BigInteger[] newPool = newPoolAfterBuy(coinReserve, shareReserve, qty, ammCost);
        return new AmmResult(
            ammCost, fee[0], fee[1], userPays,
            newPool,
            avgPrice(userPays, qty),
            price(newPool[0], newPool[1])
        );
    }

    public static AmmResult calcSell(BigInteger coinReserve, BigInteger shareReserve, long qty) {
        return calcSell(coinReserve, shareReserve, BigInteger.valueOf(qty));
    }

    public static AmmResult calcSell(BigInteger coinReserve, BigInteger shareReserve, BigInteger qty) {
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

    private static void validatePoolAndQty(BigInteger coinReserve, BigInteger shareReserve, BigInteger qty) {
        if (coinReserve == null || shareReserve == null
                || coinReserve.signum() <= 0 || shareReserve.signum() <= 0) {
            throw new IllegalStateException("AMM 풀이 초기화되지 않은 종목입니다. 잠시 후 다시 시도해주세요.");
        }
        if (qty == null || qty.signum() <= 0) {
            throw new IllegalStateException("주문 수량은 1주 이상이어야 합니다.");
        }
    }

    private static BigInteger ceilDiv(BigInteger numerator, BigInteger denominator) {
        BigInteger[] qr = numerator.divideAndRemainder(denominator);
        return qr[1].signum() > 0 ? qr[0].add(BigInteger.ONE) : qr[0];
    }
}
