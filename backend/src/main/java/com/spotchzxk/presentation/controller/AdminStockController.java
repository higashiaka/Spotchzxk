package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.StockService;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.shared.exception.ChannelNotFoundException;
import com.spotchzxk.shared.exception.InsufficientFollowerCountException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/admin/stocks")
@RequiredArgsConstructor
public class AdminStockController {

    private final StockService stockService;

    @PostMapping("/bulk")
    public ResponseEntity<?> bulkAddStocks(@RequestBody Map<String, List<String>> body) {
        List<String> channelIds = body.getOrDefault("channelIds", List.of());
        if (channelIds.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "channelIds is required"));
        }

        List<String> added = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        List<Map<String, String>> failed = new ArrayList<>();

        for (String channelId : channelIds) {
            String id = channelId.trim();
            if (id.isBlank()) continue;
            try {
                Optional<Stock> result = stockService.addStockIfNew("admin", id);
                if (result.isEmpty()) {
                    skipped.add(id);
                } else {
                    added.add(id);
                }
            } catch (ChannelNotFoundException e) {
                failed.add(Map.of("id", id, "reason", "channel_not_found"));
            } catch (InsufficientFollowerCountException e) {
                failed.add(Map.of("id", id, "reason", "insufficient_followers"));
            } catch (Exception e) {
                failed.add(Map.of("id", id, "reason", e.getMessage() != null ? e.getMessage() : "unknown"));
            }
        }

        return ResponseEntity.ok(Map.of(
                "added", added.size(),
                "skipped", skipped.size(),
                "failed", failed.size(),
                "failedList", failed
        ));
    }
}
