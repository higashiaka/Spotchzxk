package com.spotchzxk.presentation.controller;

import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.presentation.dto.OrderBookDto;
import com.spotchzxk.shared.exception.ChannelNotFoundException;
import com.spotchzxk.shared.exception.InsufficientFollowerCountException;
import com.spotchzxk.application.StockService;
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
            return ResponseEntity.badRequest().body(Map.of("error", "?좏슚?섏? ?딆? 梨꾨꼸 URL ?먮뒗 ID?낅땲??"));
        }

        if (channelId.length() < 8) {
            return ResponseEntity.badRequest().body(Map.of("error", "梨꾨꼸 ID媛 ?덈Т 吏㏃뒿?덈떎."));
        }

        try {
            Optional<Stock> result = stockService.addStockIfNew(uid, channelId);

            if (result.isEmpty()) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "?대? 異붽???醫낅ぉ?낅땲??", "id", channelId));
            }

            Stock stock = result.get();
            return ResponseEntity.ok(Map.of(
                    "id", stock.getChannelId(),
                    "name", stock.getStreamerName(),
                    "price", stock.getCurrentPrice(),
                    "totalVolume", stock.getTotalSupply(),
                    "message", "醫낅ぉ??異붽??섏뿀?듬땲??"
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


