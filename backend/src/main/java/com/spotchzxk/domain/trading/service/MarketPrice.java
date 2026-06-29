package com.spotchzxk.domain.trading.service;

import com.spotchzxk.domain.stock.entity.Stock;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;

/**
 * Central price policy: AMM spot price is the source of truth.
 * currentPrice and executedPrice are snapshots/caches of this value.
 */
public final class MarketPrice {
    public static final BigDecimal MIN_TRADABLE_PRICE = BigDecimal.ONE;
    public static final String REASON_PRICE_BELOW_ONE = "PRICE_BELOW_ONE";
    public static final String REASON_INVALID_AMM_POOL = "INVALID_AMM_POOL";

    private static final int SPOT_PRICE_SCALE = 18;

    private MarketPrice() {}

    public static boolean hasValidAmmPool(Stock stock) {
        return stock.getCoinReserve() != null && stock.getShareReserve() != null
                && stock.getCoinReserve().signum() > 0 && stock.getShareReserve().signum() > 0;
    }

    public static BigDecimal spotPrice(Stock stock) {
        return spotPrice(stock.getCoinReserve(), stock.getShareReserve(), stock.getCurrentPrice());
    }

    public static BigDecimal spotPrice(BigInteger coinReserve, BigInteger shareReserve, BigDecimal fallbackPrice) {
        if (coinReserve != null && shareReserve != null
                && coinReserve.signum() > 0 && shareReserve.signum() > 0) {
            return new BigDecimal(coinReserve)
                    .divide(new BigDecimal(shareReserve), SPOT_PRICE_SCALE, RoundingMode.HALF_UP);
        }
        return fallbackPrice != null ? fallbackPrice : BigDecimal.ZERO;
    }

    public static void syncPriceSuspension(Stock stock) {
        BigDecimal price = spotPrice(stock);
        if (price.compareTo(MIN_TRADABLE_PRICE) < 0) {
            stock.suspendTrading(REASON_PRICE_BELOW_ONE);
        } else if (REASON_PRICE_BELOW_ONE.equals(stock.getTradingSuspensionReason())) {
            stock.resumeTrading();
        }
    }

    public static String suspensionReason(Stock stock) {
        if (!stock.isTradingSuspended()) {
            return null;
        }
        if (stock.getTradingSuspensionReason() != null && !stock.getTradingSuspensionReason().isBlank()) {
            return stock.getTradingSuspensionReason();
        }
        if (!hasValidAmmPool(stock)) {
            return REASON_INVALID_AMM_POOL;
        }
        if (spotPrice(stock).compareTo(MIN_TRADABLE_PRICE) < 0) {
            return REASON_PRICE_BELOW_ONE;
        }
        return "API_UNAVAILABLE";
    }
}
