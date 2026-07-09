package com.spotchzxk.domain.trading.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "liquidity_events")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class LiquidityEvent {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "channel_id", nullable = false, length = 50)
    private String channelId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private LiquidityEventPhase phase;

    @Column(nullable = false)
    private LocalDateTime startedAt;

    @Column(nullable = false)
    private LocalDateTime phaseStartedAt;

    @Column(nullable = false)
    private LocalDateTime phaseEndsAt;

    @Column
    private LocalDateTime cooldownUntil;

    @Column(nullable = false, precision = 65, scale = 6)
    private BigDecimal startPrice;

    @Column(nullable = false, precision = 65, scale = 6)
    private BigDecimal targetPeakPrice;

    @Column(nullable = false, precision = 65, scale = 6)
    private BigDecimal dumpTargetPrice;

    @Column
    private LocalDateTime lastTradeAt;

    @Builder.Default
    @Column(nullable = false)
    private int pumpTradeCount = 0;

    @Builder.Default
    @Column(nullable = false)
    private int dumpTradeCount = 0;

    @Builder.Default
    @Column(nullable = false)
    private int dumpSteps = 3;

    @Builder.Default
    @Column(nullable = false, precision = 65, scale = 0)
    private BigDecimal accumulatedBuyQuantity = BigDecimal.ZERO;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void advanceTo(LiquidityEventPhase nextPhase, LocalDateTime now, LocalDateTime endsAt) {
        this.phase = nextPhase;
        this.phaseStartedAt = now;
        this.phaseEndsAt = endsAt;
    }

    public void startCooldown(LocalDateTime now, LocalDateTime cooldownUntil) {
        this.phase = LiquidityEventPhase.COOLDOWN;
        this.phaseStartedAt = now;
        this.phaseEndsAt = cooldownUntil;
        this.cooldownUntil = cooldownUntil;
    }

    public void complete() {
        this.phase = LiquidityEventPhase.COMPLETED;
    }

    public void recordTrade(boolean buy, BigDecimal quantity, LocalDateTime now) {
        this.lastTradeAt = now;
        if (buy) {
            this.pumpTradeCount++;
            this.accumulatedBuyQuantity = this.accumulatedBuyQuantity.add(quantity);
        } else {
            this.dumpTradeCount++;
        }
    }
}
