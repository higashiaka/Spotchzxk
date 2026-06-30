package com.spotchzxk.domain.user.repository;

import com.spotchzxk.domain.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface UserRepository extends JpaRepository<User, String> {
    java.util.Optional<User> findByNaverUid(String naverUid);
    @Query(value = "SELECT * FROM users WHERE is_bot = 0 AND is_guest = 0 ORDER BY realized_profit DESC LIMIT 50", nativeQuery = true)
    List<User> findTop50NonGuestNonBotByRealizedProfit();

    @Query(value = "SELECT * FROM users WHERE is_bot = 0 AND is_guest = 0 ORDER BY dividend_total DESC LIMIT 50", nativeQuery = true)
    List<User> findTop50NonGuestNonBotByDividendTotal();

    @Query(value = "SELECT * FROM users WHERE is_bot = 0 AND is_guest = 0 AND donation_total > 0 ORDER BY donation_total DESC LIMIT 50", nativeQuery = true)
    List<User> findTop50NonGuestNonBotByDonationTotal();

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "UPDATE users SET realized_profit = 0, dividend_total = 0, donation_total = 0 WHERE is_bot = 0 AND is_guest = 0", nativeQuery = true)
    int resetAllRankingStats();

    @Query(value = """
        WITH user_assets AS (
          SELECT u.id,
            COALESCE(u.coin_balance, 0) + COALESCE(SUM(CASE WHEN us.quantity > 0
              THEN us.quantity * COALESCE(s.current_price, 0) ELSE 0 END), 0) AS total_assets
          FROM users u
          LEFT JOIN user_shares us ON us.user_id = u.id
          LEFT JOIN stocks s ON s.channel_id = us.channel_id
          WHERE u.is_bot = 0 AND u.is_guest = 0
          GROUP BY u.id, u.coin_balance
        )
        SELECT COUNT(*)
        FROM user_assets ranked
        JOIN user_assets cu ON cu.id = :uid
        WHERE ranked.total_assets > cu.total_assets
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
    @Query("UPDATE User u SET u.profileImageUrl = :profileImageUrl WHERE u.id = :userId")
    int updateProfileImageUrl(@Param("userId") String userId, @Param("profileImageUrl") String profileImageUrl);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE User u SET u.donationTotal = u.donationTotal + :delta WHERE u.id = :userId")
    int addToDonationTotal(@Param("userId") String userId, @Param("delta") BigDecimal delta);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE User u SET u.suspended = true, u.suspensionReason = :reason, u.suspendedUntil = :until WHERE u.id = :userId")
    int suspendUser(@Param("userId") String userId, @Param("reason") String reason, @Param("until") LocalDateTime until);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE User u SET u.suspended = false, u.suspensionReason = null, u.suspendedUntil = null WHERE u.id = :userId")
    int clearSuspension(@Param("userId") String userId);
}


