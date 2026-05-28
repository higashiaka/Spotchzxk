package com.spotchzxk.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "users")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @Column(length = 128)
    private String id;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal coinBalance;

    @Column(name = "display_name", length = 20)
    private String displayName;

    @Column(name = "realized_profit", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal realizedProfit = BigDecimal.ZERO;

    @Column(name = "ranking_nickname_public", nullable = false)
    @Builder.Default
    private boolean rankingNicknamePublic = false;

    @Column(nullable = false)
    @Builder.Default
    private int resetCount = 0;

    @Column(nullable = true)
    private LocalDate lastResetDate;

    @Column(nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal dividendTotal = BigDecimal.ZERO;

    @Column(nullable = false)
    @Builder.Default
    private boolean isBot = false;
}
