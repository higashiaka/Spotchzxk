package com.spotchzxk.domain.stock.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "stock_split_events")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class StockSplitEvent {

    @Id
    @Column(length = 36, nullable = false)
    private String id;

    @Column(nullable = false, length = 50)
    private String channelId;

    @Column(nullable = false)
    private int splitRatio;

    @Column(nullable = false)
    private long executedAt;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}


