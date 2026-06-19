package com.spotchzxk.domain.stock.repository;

import com.spotchzxk.domain.stock.entity.Stock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Repository
public interface StockRepository extends JpaRepository<Stock, String> {
    List<Stock> findByIsLiveTrue();
    List<Stock> findByCurrentPriceGreaterThan(BigDecimal currentPrice);
    List<Stock> findByCurrentPriceLessThan(BigDecimal currentPrice);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Stock s WHERE s.channelId = :channelId")
    Optional<Stock> findByIdForUpdate(@Param("channelId") String channelId);
}


