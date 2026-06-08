package com.spotchzxk.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "user_shares")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class UserShare {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long shareId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "channel_id")
    private Stock stock;

    @Column
    private long quantity;

    @Column
    private long preStreamQuantity;

    @Column(precision = 12, scale = 2)
    private BigDecimal avgPrice;

    @Column
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void updateOnBuy(long newQuantity, BigDecimal newAvgPrice) {
        this.quantity = newQuantity;
        this.avgPrice = newAvgPrice;
    }

    public void updateOnSell(long newQuantity) {
        this.quantity = newQuantity;
    }

}
