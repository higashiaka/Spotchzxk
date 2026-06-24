package com.spotchzxk.domain.user.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "user_dividend_logs")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class UserDividendLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 128)
    private String userId;

    @Column(nullable = false, length = 50)
    private String channelId;

    @Column(nullable = false, length = 100)
    private String streamerName;

    @Column(columnDefinition = "TEXT")
    private String profileImageUrl;

    @Column(nullable = false, precision = 65, scale = 2)
    private BigDecimal quantity;

    @Column(nullable = false, precision = 65, scale = 12)
    private BigDecimal ratePerShare;

    @Column(nullable = false, precision = 65, scale = 2)
    private BigDecimal amount;

    @Column
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}

