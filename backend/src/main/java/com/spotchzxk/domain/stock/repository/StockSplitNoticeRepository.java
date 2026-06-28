package com.spotchzxk.domain.stock.repository;

import com.spotchzxk.domain.stock.entity.StockSplitNotice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface StockSplitNoticeRepository extends JpaRepository<StockSplitNotice, String> {
    boolean existsBySplitDateAndSplitHour(LocalDate splitDate, int splitHour);
    boolean existsBySplitDateAndSplitHourAndActionType(LocalDate splitDate, int splitHour, String actionType);
    Optional<StockSplitNotice> findTopBySplitDateOrderByCreatedAtDesc(LocalDate splitDate);
}


