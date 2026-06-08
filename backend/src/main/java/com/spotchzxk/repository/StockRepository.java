package com.spotchzxk.repository;

import com.spotchzxk.entity.Stock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface StockRepository extends JpaRepository<Stock, String> {
    List<Stock> findByIsLiveTrue();
    List<Stock> findByCurrentPriceGreaterThan(int currentPrice);
}
