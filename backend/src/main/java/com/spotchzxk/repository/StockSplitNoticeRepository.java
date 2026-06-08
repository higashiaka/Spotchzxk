package com.spotchzxk.repository;

import com.spotchzxk.entity.StockSplitNotice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface StockSplitNoticeRepository extends JpaRepository<StockSplitNotice, String> {
    boolean existsBySplitDate(LocalDate splitDate);
    Optional<StockSplitNotice> findBySplitDate(LocalDate splitDate);
}
