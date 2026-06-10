package com.spotchzxk.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.DynamicUpdate;

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
    private int followerCount;

    @Column
    private int baseBroadcastHours;

    @Column(nullable = false)
    private long totalSupply;

    @Column(nullable = false)
    private long dailyVolume;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 0")
    private long dailyTradingValue;

    @Column(nullable = false)
    private int basePrice;

    @Column(nullable = false, columnDefinition = "INT DEFAULT 10000")
    private int listingPrice;

    @Column
    private int currentPrice;

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

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 0")
    private long coinReserve;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 0")
    private long shareReserve;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 0")
    private long feePool;

    @Column(nullable = false, columnDefinition = "INT DEFAULT 1")
    private int liquidityTier;

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

    public void applyTrade(int executedPrice, boolean isBuy, long qty, long tradingValue) {
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

    public void updateFollowerCount(int followerCount) {
        this.followerCount = followerCount;
    }

    public void finalizeListing(int listingPrice, long totalSupply) {
        this.currentPrice = listingPrice;
        this.basePrice = listingPrice;
        this.listingPrice = listingPrice;
        this.totalSupply = totalSupply;
        this.issuedShares = 0;
    }

    public void initAmmPool(long coinReserve, long shareReserve, int liquidityTier) {
        this.coinReserve = coinReserve;
        this.shareReserve = shareReserve;
        this.liquidityTier = liquidityTier;
        this.currentPrice = clampPrice(coinReserve / shareReserve);
    }

    public void syncIssuedShares(long totalHeld) {
        this.issuedShares = Math.max(0, totalHeld);
    }

    public void applyAmmTrade(long newCoinReserve, long newShareReserve, long fee) {
        // Issue #10: BigDecimal 나눗셈으로 반올림 처리 — long 정수 나눗셈은 소수점 버림으로 AMM 실제 가격과 불일치
        this.currentPrice = clampPrice(java.math.BigDecimal.valueOf(newCoinReserve)
                .divide(java.math.BigDecimal.valueOf(newShareReserve), 0, java.math.RoundingMode.HALF_UP)
                .longValue());
        this.coinReserve = newCoinReserve;
        this.shareReserve = newShareReserve;
        this.feePool += fee;
    }

    private static int clampPrice(long raw) {
        return (int) Math.min(raw, Integer.MAX_VALUE);
    }

    public void drainFeePool(long amount) {
        this.feePool = Math.max(0, this.feePool - amount);
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
        // AMM: more shares at lower price — coinReserve unchanged so price halves naturally
        this.shareReserve *= ratio;
    }

    private int splitPrice(int price, int ratio) {
        return Math.max(1, Math.round((float) price / ratio));
    }
}
