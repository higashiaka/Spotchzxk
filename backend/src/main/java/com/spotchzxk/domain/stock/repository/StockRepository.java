package com.spotchzxk.domain.stock.repository;

import com.spotchzxk.domain.stock.entity.Stock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface StockRepository extends JpaRepository<Stock, String> {
    List<Stock> findByIsLiveTrue();
    List<Stock> findByCurrentPriceGreaterThan(long currentPrice);
}


