package com.spotchzxk.domain.user.repository;

import com.spotchzxk.domain.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;

@Repository
public interface UserRepository extends JpaRepository<User, String> {
    @Query(value = "SELECT * FROM users WHERE is_bot = 0 AND is_guest = 0 ORDER BY realized_profit DESC LIMIT 50", nativeQuery = true)
    List<User> findTop50ByIsBotFalseOrderByRealizedProfitDesc();

    @Query(value = "SELECT * FROM users WHERE is_bot = 0 AND is_guest = 0 ORDER BY dividend_total DESC LIMIT 50", nativeQuery = true)
    List<User> findTop50ByIsBotFalseOrderByDividendTotalDesc();

    @Query(value = "SELECT * FROM users WHERE is_bot = 0 AND is_guest = 0 AND donation_total > 0 ORDER BY donation_total DESC LIMIT 50", nativeQuery = true)
    List<User> findTop50ByIsBotFalseOrderByDonationTotalDesc();

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "UPDATE users SET realized_profit = 0, dividend_total = 0, donation_total = 0 WHERE is_bot = 0 AND is_guest = 0", nativeQuery = true)
    int resetAllRankingStats();

    @Query(value = """
        SELECT COUNT(*) FROM (
          SELECT u.id,
            u.coin_balance + COALESCE(SUM(CASE WHEN us.quantity > 0
              THEN CAST(us.quantity AS DECIMAL(30,0)) * CAST(COALESCE(s.current_price, 0) AS DECIMAL(30,0)) ELSE 0 END), 0) AS total_assets
          FROM users u
          LEFT JOIN user_shares us ON us.user_id = u.id
          LEFT JOIN stocks s ON s.channel_id = us.channel_id
          WHERE u.is_bot = 0 AND u.is_guest = 0
          GROUP BY u.id, u.coin_balance
        ) ranked
        WHERE ranked.total_assets > (
          SELECT COALESCE(u2.coin_balance, 0) + COALESCE(SUM(CASE WHEN us2.quantity > 0
            THEN CAST(us2.quantity AS DECIMAL(30,0)) * CAST(COALESCE(s2.current_price, 0) AS DECIMAL(30,0)) ELSE 0 END), 0)
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

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE User u SET u.coinBalance = u.coinBalance + :delta WHERE u.id = :userId")
    int addToBalance(@Param("userId") String userId, @Param("delta") BigDecimal delta);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE User u SET u.realizedProfit = u.realizedProfit + :delta WHERE u.id = :userId")
    int addToRealizedProfit(@Param("userId") String userId, @Param("delta") BigDecimal delta);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE User u SET u.nicknameChangeTickets = u.nicknameChangeTickets + 1 WHERE u.id = :userId")
    int addNicknameTicket(@Param("userId") String userId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE User u SET u.stockAddTickets = u.stockAddTickets + 1 WHERE u.id = :userId")
    int addStockAddTicket(@Param("userId") String userId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE User u SET u.stockAddTickets = u.stockAddTickets - 1 WHERE u.id = :userId AND u.stockAddTickets > 0")
    int useStockAddTicket(@Param("userId") String userId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE User u SET u.displayName = :displayName, u.nicknameChangeTickets = u.nicknameChangeTickets - 1 WHERE u.id = :userId AND u.nicknameChangeTickets > 0")
    int changeDisplayNameAndUseNicknameTicket(@Param("userId") String userId, @Param("displayName") String displayName);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE User u SET u.rankingNicknamePublic = :isPublic WHERE u.id = :userId")
    int updateRankingNicknamePublic(@Param("userId") String userId, @Param("isPublic") boolean isPublic);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE User u SET u.donationTotal = u.donationTotal + :delta WHERE u.id = :userId")
    int addToDonationTotal(@Param("userId") String userId, @Param("delta") BigDecimal delta);
}


