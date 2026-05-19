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

    @Column
    private LocalDateTime liveStartedAt;

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
