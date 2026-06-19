package com.spotchzxk.domain.user.repository;

import com.spotchzxk.domain.user.entity.CheerLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface CheerLogRepository extends JpaRepository<CheerLog, Long> {

    interface FanRankingRow {
        String getUserId();
        String getDisplayName();
        String getProfileImageUrl();
        Boolean getRankingNicknamePublic();
        BigDecimal getTotalDonation();
    }

    @Query(value = """
            SELECT c.user_id AS userId,
                   COALESCE(u.display_name, '') AS displayName,
                   COALESCE(u.profile_image_url, '') AS profileImageUrl,
                   u.ranking_nickname_public AS rankingNicknamePublic,
                   SUM(c.burned_coins) AS totalDonation
             FROM cheer_logs c
             JOIN users u ON u.id = c.user_id
             WHERE c.stock_id = :stockId
               AND u.is_bot = 0
             GROUP BY c.user_id, u.display_name, u.profile_image_url, u.ranking_nickname_public
             ORDER BY totalDonation DESC
             LIMIT :limit
            """, nativeQuery = true)
    List<FanRankingRow> findFanRankings(@Param("stockId") String stockId, @Param("limit") int limit);
}
