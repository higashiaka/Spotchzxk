package com.spotchzxk.repository;

import com.spotchzxk.entity.Order;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface OrderRepository extends JpaRepository<Order, String> {
    List<Order> findByUserIdOrderByCreatedAtDesc(String userId);
    List<Order> findTop50ByOrderByCreatedAtDesc();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM Order o WHERE o.id = :id")
    Optional<Order> findByIdForUpdate(@Param("id") String id);

    @Query(value = """
            SELECT o.* FROM orders o
            JOIN users u ON u.id = o.user_id
            WHERE u.is_bot = 1
              AND o.status = 'completed'
            ORDER BY o.created_at DESC
            LIMIT 50
            """, nativeQuery = true)
    List<Order> findTop50BotCompletedByOrderByCreatedAtDesc();

    List<Order> findTop200ByStreamerIdOrderByCreatedAtDesc(String streamerId);
    List<Order> findTop200ByStreamerIdAndStatusOrderByCreatedAtDesc(String streamerId, String status);
    List<Order> findByStreamerIdAndCreatedAtGreaterThanEqualOrderByCreatedAtAsc(String streamerId, long fromMs);
    List<Order> findByStreamerIdAndCreatedAtBetweenOrderByCreatedAtAsc(String streamerId, long fromMs, long toMs);
    Order findTopByStreamerIdAndCreatedAtLessThanAndExecutedPriceIsNotNullOrderByCreatedAtDesc(String streamerId, long beforeMs);

    // Limit order lookup
    List<Order> findByStreamerIdAndStatusOrderByCreatedAtAsc(String streamerId, String status);
    List<Order> findByUserIdAndStatusOrderByCreatedAtDesc(String userId, String status);

    @Modifying
    @Query(value = "UPDATE orders SET user_id = :newUserId WHERE user_id = :oldUserId", nativeQuery = true)
    void updateUserId(@Param("oldUserId") String oldUserId, @Param("newUserId") String newUserId);

    @Modifying
    @Query(value = "DELETE FROM orders WHERE user_id = :userId", nativeQuery = true)
    void deleteByUserId(@Param("userId") String userId);

    // Bulk cancel a user's PENDING orders (used when resetting portfolio)
    @Modifying
    @Query(value = "UPDATE orders SET status = 'cancelled' WHERE user_id = :userId AND status = 'pending'", nativeQuery = true)
    int cancelPendingOrdersByUserId(@Param("userId") String userId);

    // For holding limit calculation — sums pending buy quantity per stock for a specific user
    @Query(value = "SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE user_id = :userId AND streamer_id = :streamerId AND type = 'buy' AND status = 'pending'", nativeQuery = true)
    long sumPendingBuyQuantity(@Param("userId") String userId, @Param("streamerId") String streamerId);

    @Query(value = "SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE user_id = :userId AND streamer_id = :streamerId AND type = 'sell' AND status = 'pending'", nativeQuery = true)
    long sumPendingSellQuantity(@Param("userId") String userId, @Param("streamerId") String streamerId);

    @Query(value = "SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE streamer_id = :streamerId AND type = 'buy' AND status = 'pending'", nativeQuery = true)
    long sumPendingBuyQuantityByStreamerId(@Param("streamerId") String streamerId);

    @Query(value = """
            SELECT limit_price, COALESCE(SUM(quantity), 0)
            FROM orders
            WHERE streamer_id = :streamerId
              AND type = 'sell'
              AND status = 'pending'
              AND order_mode = 'limit'
              AND limit_price IS NOT NULL
            GROUP BY limit_price
            ORDER BY limit_price ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> findAskLevels(@Param("streamerId") String streamerId, @Param("limit") int limit);

    @Query(value = """
            SELECT limit_price, COALESCE(SUM(quantity), 0)
            FROM orders
            WHERE streamer_id = :streamerId
              AND type = 'buy'
              AND status = 'pending'
              AND order_mode = 'limit'
              AND limit_price IS NOT NULL
            GROUP BY limit_price
            ORDER BY limit_price DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> findBidLevels(@Param("streamerId") String streamerId, @Param("limit") int limit);

    @Modifying(clearAutomatically = true)
    @Query(value = """
            UPDATE orders
            SET quantity = quantity * :ratio,
                estimated_price = estimated_price / :ratio,
                limit_price = CASE WHEN limit_price IS NULL THEN NULL ELSE limit_price / :ratio END
            WHERE streamer_id = :streamerId
              AND status = 'pending'
            """, nativeQuery = true)
    int applyPendingStockSplit(@Param("streamerId") String streamerId, @Param("ratio") int ratio);
}
