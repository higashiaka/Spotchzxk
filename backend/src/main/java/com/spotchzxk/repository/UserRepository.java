package com.spotchzxk.repository;

import com.spotchzxk.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserRepository extends JpaRepository<User, String> {
    @Query(value = "SELECT * FROM users WHERE is_bot = 0 AND is_guest = 0 ORDER BY realized_profit DESC LIMIT 50", nativeQuery = true)
    List<User> findTop50ByIsBotFalseOrderByRealizedProfitDesc();

    @Query(value = "SELECT * FROM users WHERE is_bot = 0 AND is_guest = 0 ORDER BY dividend_total DESC LIMIT 50", nativeQuery = true)
    List<User> findTop50ByIsBotFalseOrderByDividendTotalDesc();

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "UPDATE users SET realized_profit = 0, dividend_total = 0 WHERE is_bot = 0 AND is_guest = 0", nativeQuery = true)
    int resetAllRankingStats();

    @Query(value = """
        SELECT COUNT(*) FROM (
          SELECT u.id,
            u.coin_balance + COALESCE(SUM(CASE WHEN us.quantity > 0
              THEN us.quantity * COALESCE(s.current_price, 0) ELSE 0 END), 0) AS total_assets
          FROM users u
          LEFT JOIN user_shares us ON us.user_id = u.id
          LEFT JOIN stocks s ON s.channel_id = us.channel_id
          WHERE u.is_bot = 0 AND u.is_guest = 0
          GROUP BY u.id, u.coin_balance
        ) ranked
        WHERE ranked.total_assets > (
          SELECT COALESCE(u2.coin_balance, 0) + COALESCE(SUM(CASE WHEN us2.quantity > 0
            THEN us2.quantity * COALESCE(s2.current_price, 0) ELSE 0 END), 0)
          FROM users u2
          LEFT JOIN user_shares us2 ON us2.user_id = u2.id
          LEFT JOIN stocks s2 ON s2.channel_id = us2.channel_id
          WHERE u2.id = :uid
          GROUP BY u2.id
        )
        """, nativeQuery = true)
    long countUsersWithHigherTotalAssets(@Param("uid") String uid);

    @Query("SELECT COUNT(u) FROM User u WHERE u.isBot = false AND u.isGuest = false")
    long countActiveUsers();
}
