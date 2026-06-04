package com.spotchzxk.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "stocks")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
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

    public void applyTrade(int executedPrice, boolean isBuy, int qty) {
        this.currentPrice = executedPrice;
        this.dailyVolume += qty;
        if (isBuy) {
            this.issuedShares += qty;
        } else {
            this.issuedShares = Math.max(0, this.issuedShares - qty);
        }
    }

    public void applyDailyReset() {
        this.basePrice = this.currentPrice;
        this.dailyVolume = 0;
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
}
