package com.spotchzxk.domain.user.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "titles")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class Title {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 255)
    private String userId;

    @Column(name = "stock_id", length = 50)
    private String stockId;

    @Column(name = "title_type", nullable = false, length = 50)
    private String titleType;

    @Column(name = "granted_at", nullable = false)
    private LocalDateTime grantedAt;
}
