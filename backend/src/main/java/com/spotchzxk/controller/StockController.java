package com.spotchzxk.controller;

import com.spotchzxk.entity.Stock;
import com.spotchzxk.dto.OrderBookDto;
import com.spotchzxk.exception.ChannelNotFoundException;
import com.spotchzxk.exception.InsufficientFollowerCountException;
import com.spotchzxk.service.StockService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/stocks")
@RequiredArgsConstructor
public class StockController {

    private final StockService stockService;

    @GetMapping
    public ResponseEntity<List<Stock>> getAllStocks() {
        return ResponseEntity.ok(stockService.getAllStocks());
    }

    @GetMapping("/{channelId}/order-book")
    public ResponseEntity<OrderBookDto> getOrderBook(
            @PathVariable String channelId,
            @RequestParam(defaultValue = "10") int depth
    ) {
        return ResponseEntity.ok(stockService.getOrderBook(channelId, depth));
    }

    @PostMapping
    public ResponseEntity<?> addStock(@AuthenticationPrincipal String uid, @RequestBody Map<String, String> body) {
        String channelUrl = body.getOrDefault("channelUrl", "").trim();

        if (channelUrl.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "channelUrl is required"));
        }

        // Extract channel ID from URL
        // Format 1: https://chzzk.naver.com/61f73be23ed1d1d650ba24f268570036
        // Format 2: https://chzzk.naver.com/live/61f73be23ed1d1d650ba24f268570036
        String channelId = channelUrl;
        if (channelUrl.contains("chzzk.naver.com")) {
            try {
                URI uri = new URI(channelUrl);
                String path = uri.getPath().replaceAll("^/|/$", "");
                if (path.startsWith("live/")) {
                    channelId = path.substring("live/".length());
                } else {
                    channelId = path;
                }
            } catch (Exception e) {
                return ResponseEntity.badRequest().body(Map.of("error", "Invalid URL format"));
            }
        }

        channelId = channelId.replaceAll("[?#].*", "").trim();

        if (channelId.isBlank() || !channelId.matches("[a-zA-Z0-9_\\-]+")) {
            return ResponseEntity.badRequest().body(Map.of("error", "유효하지 않은 채널 URL 또는 ID입니다."));
        }

        if (channelId.length() < 8) {
            return ResponseEntity.badRequest().body(Map.of("error", "채널 ID가 너무 짧습니다."));
        }

        try {
            Optional<Stock> result = stockService.addStockIfNew(uid, channelId);

            if (result.isEmpty()) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "이미 추가된 종목입니다.", "id", channelId));
            }

            Stock stock = result.get();
            return ResponseEntity.ok(Map.of(
                    "id", stock.getChannelId(),
                    "name", stock.getStreamerName(),
                    "price", stock.getCurrentPrice(),
                    "totalVolume", stock.getTotalSupply(),
                    "message", "종목이 추가되었습니다."
            ));
        } catch (ChannelNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", e.getMessage()));
        } catch (InsufficientFollowerCountException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }
}
