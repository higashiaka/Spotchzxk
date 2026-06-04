package com.spotchzxk.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;

@Entity
@Table(name = "orders")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
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
    private String status; // "completed" | "pending" | "cancelled"

    /** 주문 방식: "market" | "limit" */
    @Builder.Default
    @Column(name = "order_mode", nullable = false, length = 10)
    private String orderMode = "market";

    /** 지정가 (limit 주문 시에만 설정) */
    @Column(name = "limit_price", precision = 12, scale = 2)
    private BigDecimal limitPrice;

    @Column(name = "created_at", nullable = false)
    private long createdAt; // epoch milliseconds

    public void complete(BigDecimal executedPrice, long executedAt) {
        this.executedPrice = executedPrice;
        this.status = "completed";
        this.createdAt = executedAt;
    }

    public void cancel() {
        this.status = "cancelled";
    }
}
