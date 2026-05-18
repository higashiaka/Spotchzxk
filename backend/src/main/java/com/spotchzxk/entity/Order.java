package com.spotchzxk.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;

@Entity
@Table(name = "orders")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Order {

    @Id
    @Column(length = 36, nullable = false)
    private String id;

    @Column(name = "user_id", nullable = false, length = 128)
    private String userId;

    @Column(name = "streamer_id", nullable = false, length = 50)
    private String streamerId;

    @Column(nullable = false, length = 10)
    private String type; // "buy" or "sell"

    @Column(nullable = false)
    private int quantity;

    @Column(name = "estimated_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal estimatedPrice;

    @Column(name = "executed_price", precision = 12, scale = 2)
    private BigDecimal executedPrice;

    @Column(nullable = false, length = 20)
    private String status; // e.g. "completed"

    @Column(name = "created_at", nullable = false)
    private long createdAt; // epoch milliseconds
}
