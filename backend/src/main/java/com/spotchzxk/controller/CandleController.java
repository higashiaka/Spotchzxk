package com.spotchzxk.controller;

import com.spotchzxk.dto.OhlcCandle;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.service.CandleService;
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
            @RequestParam(defaultValue = "50") int count) {

        long listedAtMs = stockRepository.findById(stockId)
                .map(Stock::getListedAt)
                .map(dt -> dt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli())
                .orElse(0L);

        return ResponseEntity.ok(candleService.getCandles(stockId, interval, count, listedAtMs));
    }
}
