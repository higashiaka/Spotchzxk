package com.spotchzxk.presentation.controller;

import com.spotchzxk.presentation.dto.OhlcCandle;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.application.CandleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.ZoneId;
import java.util.List;

@RestController
@RequestMapping("/api/stocks")
@RequiredArgsConstructor
public class CandleController {

    private final CandleService candleService;
    private final StockRepository stockRepository;

    @GetMapping("/{stockId}/candles")
    public ResponseEntity<List<OhlcCandle>> getCandles(
            @PathVariable String stockId,
            @RequestParam(defaultValue = "5m") String interval,
            @RequestParam(defaultValue = "100") int count,
            @RequestParam(required = false) Long before) {

        Stock stock = stockRepository.findById(stockId).orElse(null);
        long listedAtMs = stock != null && stock.getListedAt() != null
                ? stock.getListedAt().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
                : 0L;
        double fallbackPrice = stock != null ? (double) stock.getCurrentPrice() : 1000.0;

        long beforeMs = before != null ? before : System.currentTimeMillis();
        return ResponseEntity.ok(candleService.getCandles(stockId, interval, count, beforeMs, listedAtMs, fallbackPrice));
    }
}


