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
    List<Order> findByStreamerIdOrderByCreatedAtAsc(String streamerId);
    List<Order> findByStreamerIdAndCreatedAtGreaterThanEqualOrderByCreatedAtAsc(String streamerId, long fromMs);
    List<Order> findByStreamerIdAndCreatedAtBetweenOrderByCreatedAtAsc(String streamerId, long fromMs, long toMs);

    @Modifying
    @Query(value = "UPDATE orders SET user_id = :newUserId WHERE user_id = :oldUserId", nativeQuery = true)
    void updateUserId(@Param("oldUserId") String oldUserId, @Param("newUserId") String newUserId);

    @Modifying
    @Query(value = "DELETE FROM orders WHERE user_id = :userId", nativeQuery = true)
    void deleteByUserId(@Param("userId") String userId);
}
