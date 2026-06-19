package com.spotchzxk.presentation.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.spotchzxk.domain.stock.entity.Stock;

import java.math.BigDecimal;
import java.math.BigInteger;
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
        LocalDateTime listedAt
) {
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
                s.getListedAt()
        );
    }
}
