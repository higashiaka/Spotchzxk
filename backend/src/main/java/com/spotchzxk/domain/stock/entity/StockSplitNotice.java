package com.spotchzxk.domain.stock.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "stock_split_notices")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class StockSplitNotice {

    @Id
    @Column(length = 36, nullable = false)
    private String id;

    @Column(nullable = false)
    private LocalDate splitDate;

    @Column(nullable = false)
    private int splitHour;

    @Column(nullable = false, length = 30)
    private String actionType;

    @Column(nullable = false)
    private int thresholdPrice;

    @Column(nullable = false)
    private int splitRatio;

    @Column(nullable = false)
    private int stockCount;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String stockNames;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}


