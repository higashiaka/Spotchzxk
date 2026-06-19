package com.spotchzxk.domain.user.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "cheer_logs")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class CheerLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 255)
    private String userId;

    @Column(name = "stock_id", nullable = false, length = 50)
    private String stockId;

    @Column(name = "burned_coins", nullable = false)
    private long burnedCoins;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
