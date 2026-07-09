package com.spotchzxk.presentation.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.trading.service.MarketPrice;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record StockResponse(
        String channelId,
        String streamerName,
        String profileImageUrl,
        long followerCount,

        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal totalSupply,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal dailyVolume,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal dailyTradingValue,

        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal basePrice,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal listingPrice,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal currentPrice,

        @JsonProperty("isLive") boolean isLive,
        LocalDateTime liveStartedAt,
        long dividendAccumulationCount,

        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal issuedShares,

        long liquidityTier,
        boolean tradingSuspended,
        String tradingSuspensionReason,
        LocalDateTime listedAt,

        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal nextDividendPerShare
) {
    private static final BigDecimal FEE_POOL_PAYOUT_RATIO = new BigDecimal("0.35");

    public static StockResponse from(Stock s) {
        return from(s, BigDecimal.ZERO);
    }

    public static StockResponse from(Stock s, BigDecimal eligibleShares) {
        return new StockResponse(
                s.getChannelId(),
                s.getStreamerName(),
                s.getProfileImageUrl(),
                s.getFollowerCount(),
                s.getTotalSupply(),
                s.getDailyVolume(),
                s.getDailyTradingValue(),
                s.getBasePrice(),
                s.getListingPrice(),
                MarketPrice.spotPrice(s),
                s.isLive(),
                s.getLiveStartedAt(),
                s.getDividendAccumulationCount(),
                s.getIssuedShares(),
                s.getLiquidityTier(),
                s.isTradingSuspended(),
                MarketPrice.suspensionReason(s),
                s.getListedAt(),
                nextDividendPerShare(s, eligibleShares)
        );
    }

    private static BigDecimal nextDividendPerShare(Stock s, BigDecimal eligibleShares) {
        if (eligibleShares == null || eligibleShares.signum() <= 0 || s.getFeePool() == null || s.getFeePool().signum() <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal totalPayout = new BigDecimal(s.getFeePool())
                .multiply(FEE_POOL_PAYOUT_RATIO)
                .setScale(0, java.math.RoundingMode.FLOOR);
        if (totalPayout.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        return totalPayout.divide(eligibleShares, 12, java.math.RoundingMode.FLOOR);
    }
}
