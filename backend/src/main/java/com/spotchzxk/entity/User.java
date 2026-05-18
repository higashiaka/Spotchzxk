package com.spotchzxk.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "users")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @Column(length = 128)
    private String id;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal coinBalance;

    @Column(nullable = false)
    @Builder.Default
    private int resetCount = 0;

    @Column(nullable = true)
    private LocalDate lastResetDate;
}
