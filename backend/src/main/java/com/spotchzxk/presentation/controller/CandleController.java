package com.spotchzxk.presentation.controller;

import com.spotchzxk.presentation.dto.OhlcCandle;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.stock.repository.StockSplitEventRepository;
import com.spotchzxk.application.CandleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.ZoneId;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/stocks")
@RequiredArgsConstructor
public class CandleController {

    private final CandleService candleService;
    private final StockRepository stockRepository;
    private final StockSplitEventRepository stockSplitEventRepository;

    @GetMapping("/{stockId}/candles")
    public ResponseEntity<Map<String, Object>> getCandles(
            @PathVariable String stockId,
            @RequestParam(defaultValue = "5m") String interval,
            @RequestParam(defaultValue = "100") int count,
            @RequestParam(required = false) Long before) {

        Stock stock = stockRepository.findById(stockId).orElse(null);
        long listedAtMs = stock != null && stock.getListedAt() != null
                ? stock.getListedAt().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
                : 0L;
        long fallbackPrice = stock != null ? stock.getCurrentPrice().longValue() : 1000L;

        long beforeMs = before != null ? before : System.currentTimeMillis();
        List<OhlcCandle> candles = candleService.getCandles(stockId, interval, count, beforeMs, listedAtMs, fallbackPrice);

        List<Map<String, Object>> splitMarkers = stockSplitEventRepository
                .findByChannelIdOrderByExecutedAtDesc(stockId)
                .stream()
                .map(e -> Map.<String, Object>of(
                        "executedAt", e.getExecutedAt(),
                        "splitRatio", e.getSplitRatio()))
                .toList();

        return ResponseEntity.ok(Map.of(
                "candles", candles,
                "markers", splitMarkers,
                "splitEvents", splitMarkers,
                "priceScale", "current"));
    }
}


