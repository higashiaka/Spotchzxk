package com.spotchzxk.repository;

import com.spotchzxk.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface OrderRepository extends JpaRepository<Order, String> {
    List<Order> findByUserIdOrderByCreatedAtDesc(String userId);
    List<Order> findTop50ByOrderByCreatedAtDesc();
    List<Order> findByStreamerIdOrderByCreatedAtAsc(String streamerId);
    List<Order> findByStreamerIdAndCreatedAtGreaterThanEqualOrderByCreatedAtAsc(String streamerId, long fromMs);
    List<Order> findByStreamerIdAndCreatedAtBetweenOrderByCreatedAtAsc(String streamerId, long fromMs, long toMs);
}
