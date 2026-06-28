package com.spotchzxk.presentation.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.spotchzxk.domain.stock.entity.Stock;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
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
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigInteger coinReserve,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigInteger shareReserve,

        long liquidityTier,
        boolean tradingSuspended,
        String tradingSuspensionReason,
        LocalDateTime listedAt
) {
    private static final BigDecimal MIN_TRADABLE_PRICE = BigDecimal.ONE;
    private static final int AMM_PRICE_SCALE = 18;

    public static StockResponse from(Stock s) {
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
                s.getCurrentPrice(),
                s.isLive(),
                s.getLiveStartedAt(),
                s.getDividendAccumulationCount(),
                s.getIssuedShares(),
                s.getCoinReserve(),
                s.getShareReserve(),
                s.getLiquidityTier(),
                s.isTradingSuspended(),
                suspensionReason(s),
                s.getListedAt()
        );
    }

    private static String suspensionReason(Stock s) {
        if (!s.isTradingSuspended()) {
            return null;
        }
        if (s.getCoinReserve() == null || s.getShareReserve() == null
                || s.getCoinReserve().signum() <= 0 || s.getShareReserve().signum() <= 0) {
            return "INVALID_AMM_POOL";
        }
        BigDecimal ammPrice = new BigDecimal(s.getCoinReserve())
                .divide(new BigDecimal(s.getShareReserve()), AMM_PRICE_SCALE, RoundingMode.HALF_UP);
        if (ammPrice.compareTo(MIN_TRADABLE_PRICE) < 0) {
            return "PRICE_BELOW_ONE";
        }
        return "API_UNAVAILABLE";
    }
}
