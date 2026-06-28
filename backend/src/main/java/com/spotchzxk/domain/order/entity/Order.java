package com.spotchzxk.domain.order.entity;

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

    @Column(nullable = false, precision = 65, scale = 0)
    private BigDecimal quantity;

    @Column(name = "estimated_price", nullable = false, precision = 65, scale = 6)
    private BigDecimal estimatedPrice;

    @Column(name = "executed_price", precision = 65, scale = 6)
    private BigDecimal executedPrice;

    @Column(nullable = false, length = 20)
    private String status; // "completed" | "pending" | "cancelled"

    /** Order mode: "market" | "limit" */
    @Builder.Default
    @Column(name = "order_mode", nullable = false, length = 10)
    private String orderMode = "market";

    /** Limit price (set only for limit orders) */
    @Column(name = "limit_price", precision = 65, scale = 6)
    private BigDecimal limitPrice;

    @Column(name = "created_at", nullable = false)
    private long createdAt; // epoch milliseconds

    @Column(name = "executed_at")
    private Long executedAt; // epoch milliseconds, null until filled

    // Issue #6: added in V49 migration to track partial fills; default 0 until any quantity is executed
    @Builder.Default
    @Column(name = "filled_quantity", nullable = false, precision = 65, scale = 0)
    private BigDecimal filledQuantity = BigDecimal.ZERO;

    @Builder.Default
    @Column(name = "allow_partial", nullable = false)
    private boolean allowPartial = false;

    @Column(name = "expires_at")
    private java.time.LocalDateTime expiresAt;

    public void complete(BigDecimal executedPrice, long executedAt) {
        this.executedPrice = executedPrice;
        this.status = "completed";
        this.executedAt = executedAt;
    }

    /** ?ㅼ젣 嫄곕옒 諛쒖깮 ?쒓컖. 利됱떆 泥닿껐? createdAt, 吏?뺢? ?섏쨷 泥닿껐? executedAt. */
    public long tradeAt() {
        return executedAt != null ? executedAt : createdAt;
    }

    /**
     * Records a partial fill. Transitions to "completed" when all quantity is filled;
     * otherwise remains "pending" with updated filledQuantity.
     */
    public void partialFill(BigDecimal partialQty, BigDecimal avgPrice, long executedAt) {
        this.filledQuantity = this.filledQuantity.add(partialQty);
        this.executedPrice = avgPrice;
        this.executedAt = executedAt;
        if (this.filledQuantity.compareTo(this.quantity) >= 0) {
            this.status = "completed";
        }
    }

    public BigDecimal remainingQuantity() {
        return quantity.subtract(filledQuantity);
    }

    public void cancel() {
        this.status = "cancelled";
    }

}


