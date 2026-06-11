package com.spotchzxk.domain.stock.repository;

import com.spotchzxk.domain.stock.entity.StockSplitEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface StockSplitEventRepository extends JpaRepository<StockSplitEvent, String> {
    List<StockSplitEvent> findByChannelIdAndExecutedAtGreaterThanOrderByExecutedAtAsc(String channelId, long executedAt);
}


