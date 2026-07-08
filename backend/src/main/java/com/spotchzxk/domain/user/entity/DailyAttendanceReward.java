package com.spotchzxk.domain.user.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "daily_attendance_rewards",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_daily_attendance_user_date",
                columnNames = {"user_id", "attendance_date"}
        )
)
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class DailyAttendanceReward {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 128)
    private String userId;

    @Column(name = "attendance_date", nullable = false)
    private LocalDate attendanceDate;

    @Column(name = "streak_day", nullable = false)
    private long streakDay;

    @Column(name = "reward_type", nullable = false, length = 32)
    private String rewardType;

    @Column(name = "item_type", length = 64)
    private String itemType;

    @Column(name = "item_name", length = 100)
    private String itemName;

    @Column(name = "item_quantity", nullable = false)
    @Builder.Default
    private long itemQuantity = 0;

    @Column(name = "reward_amount", nullable = false, precision = 65, scale = 2)
    private BigDecimal rewardAmount;

    @Column(name = "claimed_at", nullable = false)
    private LocalDateTime claimedAt;
}
