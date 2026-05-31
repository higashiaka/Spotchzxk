package com.spotchzxk.repository;

import com.spotchzxk.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface OrderRepository extends JpaRepository<Order, String> {
    List<Order> findByUserIdOrderByCreatedAtDesc(String userId);
    List<Order> findTop50ByOrderByCreatedAtDesc();
    @Query(value = """
            SELECT o.* FROM orders o
            JOIN users u ON u.id = o.user_id
            WHERE u.is_bot = 1
              AND o.status = 'completed'
            ORDER BY o.created_at DESC
            LIMIT 50
            """, nativeQuery = true)
    List<Order> findTop50BotCompletedByOrderByCreatedAtDesc();

    List<Order> findTop200ByStreamerIdOrderByCreatedAtAsc(String streamerId);
    List<Order> findByStreamerIdAndCreatedAtGreaterThanEqualOrderByCreatedAtAsc(String streamerId, long fromMs);
    List<Order> findByStreamerIdAndCreatedAtBetweenOrderByCreatedAtAsc(String streamerId, long fromMs, long toMs);

    // 지정가 주문 조회
    List<Order> findByStreamerIdAndStatusOrderByCreatedAtAsc(String streamerId, String status);
    List<Order> findByUserIdAndStatusOrderByCreatedAtDesc(String userId, String status);

    @Modifying
    @Query(value = "UPDATE orders SET user_id = :newUserId WHERE user_id = :oldUserId", nativeQuery = true)
    void updateUserId(@Param("oldUserId") String oldUserId, @Param("newUserId") String newUserId);

    @Modifying
    @Query(value = "DELETE FROM orders WHERE user_id = :userId", nativeQuery = true)
    void deleteByUserId(@Param("userId") String userId);

    // 유저의 PENDING 주문 일괄 취소 (포트폴리오 리셋 시 사용)
    @Modifying
    @Query(value = "UPDATE orders SET status = 'cancelled' WHERE user_id = :userId AND status = 'pending'", nativeQuery = true)
    int cancelPendingOrdersByUserId(@Param("userId") String userId);

    // 보유 한도 계산용 — 특정 유저의 종목별 미체결 매수 수량 합산
    @Query(value = "SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE user_id = :userId AND streamer_id = :streamerId AND type = 'buy' AND status = 'pending'", nativeQuery = true)
    long sumPendingBuyQuantity(@Param("userId") String userId, @Param("streamerId") String streamerId);
}
