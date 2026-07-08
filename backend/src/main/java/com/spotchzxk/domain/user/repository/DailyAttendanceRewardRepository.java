package com.spotchzxk.domain.user.repository;

import com.spotchzxk.domain.user.entity.DailyAttendanceReward;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface DailyAttendanceRewardRepository extends JpaRepository<DailyAttendanceReward, Long> {
    boolean existsByUserIdAndAttendanceDate(String userId, LocalDate attendanceDate);

    Optional<DailyAttendanceReward> findByUserIdAndAttendanceDate(String userId, LocalDate attendanceDate);

    Optional<DailyAttendanceReward> findTopByUserIdOrderByAttendanceDateDesc(String userId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE DailyAttendanceReward r SET r.userId = :toUserId WHERE r.userId = :fromUserId")
    int updateUserId(@Param("fromUserId") String fromUserId, @Param("toUserId") String toUserId);
}
