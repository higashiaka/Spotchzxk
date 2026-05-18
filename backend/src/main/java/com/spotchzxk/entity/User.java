package com.spotchzxk.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

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
}
