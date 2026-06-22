package com.spotchzxk.domain.trading.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.math.BigInteger;

@Entity
@Table(name = "trade_failure_logs")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class TradeFailureLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 128)
    private String userId;

    @Column(name = "streamer_id", nullable = false, length = 50)
    private String streamerId;

    @Column(nullable = false, length = 10)
    private String type;

    @Column(precision = 65, scale = 0)
    private BigDecimal quantity;

    @Column(precision = 65, scale = 6)
    private BigDecimal price;

    @Column(name = "order_mode", length = 10)
    private String orderMode;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Column(name = "failed_at", nullable = false)
    private long failedAt;
}
