package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.StockService;
import com.spotchzxk.domain.stock.entity.Stock;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.text.NumberFormat;
import java.util.Locale;
import java.util.Optional;

@RestController
@RequestMapping("/og")
@RequiredArgsConstructor
public class OgController {

    private final StockService stockService;

    @GetMapping(value = "/stocks/{id}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> stockOg(@PathVariable String id) {
        Optional<Stock> opt = stockService.getAllStocks().stream()
                .filter(s -> s.getChannelId().equals(id))
                .findFirst();

        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Stock stock = opt.get();
        long price = stock.getCurrentPrice();
        long base = stock.getBasePrice() > 0 ? stock.getBasePrice() : price;
        double pct = base > 0 ? (price - base) * 100.0 / base : 0;
        String sign = pct >= 0 ? "+" : "";
        String formattedPrice = NumberFormat.getNumberInstance(Locale.KOREA).format(price);
        String formattedFollowers = NumberFormat.getNumberInstance(Locale.KOREA).format(stock.getFollowerCount());

        String title = stock.getStreamerName() + " — Spotchzxk";
        String description = String.format("현재가 %s코인 (%s%.2f%%) · 팔로워 %s명",
                formattedPrice, sign, pct, formattedFollowers);
        String image = stock.getProfileImageUrl() != null ? stock.getProfileImageUrl() : "";
        String url = "https://spotchzxk.xyz/stocks/" + id;

        String html = """
                <!DOCTYPE html>
                <html lang="ko">
                <head>
                  <meta charset="UTF-8">
                  <title>%s</title>
                  <meta name="description" content="%s">
                  <meta property="og:type" content="website">
                  <meta property="og:url" content="%s">
                  <meta property="og:title" content="%s">
                  <meta property="og:description" content="%s">
                  %s
                  <meta name="twitter:card" content="summary">
                  <meta name="twitter:title" content="%s">
                  <meta name="twitter:description" content="%s">
                  %s
                  <meta http-equiv="refresh" content="0;url=%s">
                </head>
                <body></body>
                </html>
                """.formatted(
                title, description, url, title, description,
                image.isBlank() ? "" : "<meta property=\"og:image\" content=\"" + image + "\">",
                title, description,
                image.isBlank() ? "" : "<meta name=\"twitter:image\" content=\"" + image + "\">",
                url
        );

        return ResponseEntity.ok(html);
    }
}
