package com.spotchzxk.repository;

import com.spotchzxk.entity.StockSplitNotice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface StockSplitNoticeRepository extends JpaRepository<StockSplitNotice, String> {
    boolean existsBySplitDateAndSplitHour(LocalDate splitDate, int splitHour);
    Optional<StockSplitNotice> findTopBySplitDateOrderByCreatedAtDesc(LocalDate splitDate);
}
