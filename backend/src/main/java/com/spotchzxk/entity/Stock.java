package com.spotchzxk.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "stocks")
@Getter
@Setter
@Builder
@NoArgsConstructor
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

    @Column
    private int currentPrice;

    @Column
    @com.fasterxml.jackson.annotation.JsonProperty("isLive")
    private boolean isLive;

    @Builder.Default
    @Column(precision = 12, scale = 2)
    private java.math.BigDecimal dividendPool = java.math.BigDecimal.ZERO;

    @Column
    private LocalDateTime liveStartedAt;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 0")
    private long dividendAccumulationCount;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 0")
    private long issuedShares;

    // 방송 시작 시점 실제 유통량 (하우스 제외, pre_stream_quantity 합산) — 주당 배당 계산 분모
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
    }
}
