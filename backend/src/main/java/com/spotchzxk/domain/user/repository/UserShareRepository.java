package com.spotchzxk.domain.user.repository;

import com.spotchzxk.domain.user.entity.UserShare;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserShareRepository extends JpaRepository<UserShare, Long> {
    
    List<UserShare> findByUserId(String userId);

    @Query("SELECT us FROM UserShare us JOIN FETCH us.stock WHERE us.user.id = :userId AND us.quantity > 0")
    List<UserShare> findByUserIdWithPositiveQuantityAndStock(@Param("userId") String userId);

    Optional<UserShare> findByUserIdAndStockChannelId(String userId, String channelId);

    @Modifying(clearAutomatically = true)
    @Query(value = "UPDATE users u JOIN user_shares s ON u.id = s.user_id SET u.coin_balance = u.coin_balance + (s.pre_stream_quantity * :calculatedRate), u.dividend_total = u.dividend_total + (s.pre_stream_quantity * :calculatedRate) WHERE s.channel_id = :activeChannelId AND s.pre_stream_quantity > 0 AND s.user_id != '__house__' AND u.is_bot = 0", nativeQuery = true)
    int distributeDividends(@Param("activeChannelId") String activeChannelId, @Param("calculatedRate") BigDecimal calculatedRate);

    @Modifying
    @Query(value = "UPDATE user_shares SET pre_stream_quantity = CASE WHEN user_id = '__house__' THEN 0 ELSE quantity END WHERE channel_id = :channelId", nativeQuery = true)
    void snapshotPreStreamQuantities(@Param("channelId") String channelId);

    @Query("SELECT us FROM UserShare us JOIN FETCH us.user WHERE us.stock.channelId = :channelId AND us.quantity > 0")
    List<UserShare> findByStockChannelIdWithPositiveQuantity(@Param("channelId") String channelId);

    @Query("SELECT us FROM UserShare us JOIN FETCH us.user WHERE us.stock.channelId = :channelId AND us.preStreamQuantity > 0")
    List<UserShare> findByStockChannelIdWithPositivePreStreamQuantity(@Param("channelId") String channelId);

    @Modifying
    @Query(value = "UPDATE user_shares SET user_id = :newUserId WHERE user_id = :oldUserId", nativeQuery = true)
    void updateUserId(@Param("oldUserId") String oldUserId, @Param("newUserId") String newUserId);

    @Modifying
    @Query(value = "DELETE FROM user_shares WHERE user_id = :userId", nativeQuery = true)
    void deleteByUserId(@Param("userId") String userId);

    @Query(value = "SELECT COALESCE(SUM(pre_stream_quantity), 0) FROM user_shares WHERE channel_id = :channelId AND pre_stream_quantity > 0 AND user_id != '__house__'", nativeQuery = true)
    long sumPreStreamQuantityByChannel(@Param("channelId") String channelId);

    @Query(value = "SELECT COALESCE(SUM(quantity), 0) FROM user_shares WHERE channel_id = :channelId AND user_id != '__house__'", nativeQuery = true)
    long sumQuantityByStock(@Param("channelId") String channelId);

    @Modifying(clearAutomatically = true)
    @Query(value = """
            UPDATE user_shares
            SET quantity = LEAST(quantity, 9223372036854775807 / :ratio),
                pre_stream_quantity = LEAST(pre_stream_quantity, 9223372036854775807 / :ratio)
            WHERE channel_id = :channelId
              AND (quantity > 9223372036854775807 / :ratio
                   OR pre_stream_quantity > 9223372036854775807 / :ratio)
            """, nativeQuery = true)
    int capOverflowQuantities(@Param("channelId") String channelId, @Param("ratio") int ratio);

    @Modifying(clearAutomatically = true)
    @Query(value = """
            UPDATE user_shares
            SET quantity = quantity * :ratio,
                pre_stream_quantity = pre_stream_quantity * :ratio,
                avg_price = CASE WHEN avg_price IS NULL THEN NULL ELSE avg_price / :ratio END
            WHERE channel_id = :channelId
            """, nativeQuery = true)
    int applyStockSplit(@Param("channelId") String channelId, @Param("ratio") int ratio);
}


