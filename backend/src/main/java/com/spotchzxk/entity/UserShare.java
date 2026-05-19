package com.spotchzxk.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_shares")
@Getter
@Setter
@Builder
@NoArgsConstructor
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

    @Column(precision = 12, scale = 2)
    private java.math.BigDecimal avgPrice;

    @Column
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
