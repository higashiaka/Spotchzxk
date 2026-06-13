package com.spotchzxk.domain.stock.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.DynamicUpdate;
import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.time.LocalDateTime;

@Entity
@Table(name = "stocks")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@DynamicUpdate
public class Stock {

    @Id
    @Column(length = 50)
    private String channelId;

    @Column(nullable = false, length = 100)
    private String streamerName;

    @Column(columnDefinition = "TEXT")
    private String profileImageUrl;

    @Column
    private long followerCount;

    @Column
    private long baseBroadcastHours;

    @Column(nullable = false)
    private long totalSupply;

    @Column(nullable = false)
    private long dailyVolume;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 0")
    private long dailyTradingValue;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 0")
    private long basePrice;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 10000")
    private long listingPrice;

    @Column(columnDefinition = "BIGINT DEFAULT 0")
    private long currentPrice;

    @Column
    @com.fasterxml.jackson.annotation.JsonProperty("isLive")
    private boolean isLive;

    @Column
    private LocalDateTime liveStartedAt;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 0")
    private long dividendAccumulationCount;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 0")
    private long issuedShares;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 0")
    private long preStreamFloat;

    @Builder.Default
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    @Column(nullable = false, precision = 65, scale = 0, columnDefinition = "DECIMAL(65,0) DEFAULT 0")
    private BigInteger coinReserve = BigInteger.ZERO;

    @Builder.Default
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    @Column(nullable = false, precision = 65, scale = 0, columnDefinition = "DECIMAL(65,0) DEFAULT 0")
    private BigInteger shareReserve = BigInteger.ZERO;

    @Builder.Default
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    @Column(nullable = false, precision = 65, scale = 0, columnDefinition = "DECIMAL(65,0) DEFAULT 0")
    private BigInteger feePool = BigInteger.ZERO;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 1")
    private long liquidityTier;

    @Column(nullable = false, columnDefinition = "BOOLEAN DEFAULT FALSE")
    private boolean tradingSuspended;

    @Column(updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime listedAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        if (listedAt == null)  listedAt  = LocalDateTime.now();
        if (listingPrice <= 0) listingPrice = Math.max(10_000, currentPrice);
    }

    public void applyTrade(long executedPrice, boolean isBuy, long qty, long tradingValue) {
        this.currentPrice = executedPrice;
        this.dailyVolume += qty;
        this.dailyTradingValue += tradingValue;
        if (isBuy) {
            this.issuedShares += qty;
        } else {
            this.issuedShares = Math.max(0, this.issuedShares - qty);
        }
    }

    public void applyDailyReset() {
        this.basePrice = this.currentPrice;
        this.dailyVolume = 0;
        this.dailyTradingValue = 0;
    }

    public void startLive(LocalDateTime startedAt) {
        this.isLive = true;
        this.liveStartedAt = startedAt;
        this.dividendAccumulationCount = 0;
    }

    public void endLive() {
        this.isLive = false;
        this.liveStartedAt = null;
        this.dividendAccumulationCount = 0;
    }

    public void updateDividendAccumulation(long count) {
        this.dividendAccumulationCount = count;
    }

    public void updatePreStreamFloat(long preStreamFloat) {
        this.preStreamFloat = preStreamFloat;
    }

    public void updateStreamerName(String streamerName) {
        this.streamerName = streamerName;
    }

    public void updateProfileImageUrl(String profileImageUrl) {
        this.profileImageUrl = profileImageUrl;
    }

    public void updateFollowerCount(long followerCount) {
        this.followerCount = followerCount;
    }

    public void finalizeListing(long listingPrice, long totalSupply) {
        this.currentPrice = listingPrice;
        this.basePrice = listingPrice;
        this.listingPrice = listingPrice;
        this.totalSupply = totalSupply;
        this.issuedShares = 0;
    }

    public void initAmmPool(BigInteger coinReserve, BigInteger shareReserve, long liquidityTier) {
        this.coinReserve = coinReserve;
        this.shareReserve = shareReserve;
        this.liquidityTier = liquidityTier;
        this.currentPrice = toLongPrice(new BigDecimal(coinReserve)
                .divide(new BigDecimal(shareReserve), 0, RoundingMode.HALF_UP));
    }

    public void initAmmPool(long coinReserve, long shareReserve, long liquidityTier) {
        initAmmPool(BigInteger.valueOf(coinReserve), BigInteger.valueOf(shareReserve), liquidityTier);
    }

    public void syncIssuedShares(long totalHeld) {
        this.issuedShares = Math.max(0, totalHeld);
    }

    public void applyAmmTrade(BigInteger newCoinReserve, BigInteger newShareReserve, BigInteger fee) {
        this.currentPrice = toLongPrice(new BigDecimal(newCoinReserve)
                .divide(new BigDecimal(newShareReserve), 0, RoundingMode.HALF_UP));
        this.coinReserve = newCoinReserve;
        this.shareReserve = newShareReserve;
        this.feePool = nonNull(this.feePool).add(fee);
    }

    public void suspendTrading() {
        this.tradingSuspended = true;
    }

    public void resumeTrading() {
        this.tradingSuspended = false;
    }

    public void drainFeePool(BigInteger amount) {
        this.feePool = nonNull(this.feePool).subtract(amount).max(BigInteger.ZERO);
    }

    public void applyStockSplit(int ratio) {
        if (ratio <= 1) {
            throw new IllegalArgumentException("Split ratio must be greater than 1.");
        }
        this.currentPrice = splitPrice(this.currentPrice, ratio);
        this.basePrice = splitPrice(this.basePrice, ratio);
        this.listingPrice = splitPrice(this.listingPrice, ratio);
        this.totalSupply *= ratio;
        this.dailyVolume *= ratio;
        this.issuedShares *= ratio;
        this.preStreamFloat *= ratio;
        // AMM: more shares at lower price ??coinReserve unchanged so price halves naturally
        this.shareReserve = nonNull(this.shareReserve).multiply(BigInteger.valueOf(ratio));
    }

    private long splitPrice(long price, int ratio) {
        return Math.max(1L, java.math.BigDecimal.valueOf(price)
                .divide(java.math.BigDecimal.valueOf(ratio), 0, java.math.RoundingMode.HALF_UP)
                .longValue());
    }

    private long toLongPrice(BigDecimal price) {
        if (price.compareTo(BigDecimal.valueOf(Long.MAX_VALUE)) > 0) {
            return Long.MAX_VALUE;
        }
        return Math.max(1L, price.longValue());
    }

    private BigInteger nonNull(BigInteger value) {
        return value != null ? value : BigInteger.ZERO;
    }
}
