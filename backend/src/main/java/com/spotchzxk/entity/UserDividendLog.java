package com.spotchzxk.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "user_dividend_logs")
@Getter
@Setter
@Builder
@NoArgsConstructor
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

    @Column(nullable = false)
    private long quantity;

    @Column(nullable = false, precision = 14, scale = 4)
    private BigDecimal ratePerShare;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
