package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.StockService;
import com.spotchzxk.presentation.dto.StockResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@RestController
@RequestMapping("/og")
@RequiredArgsConstructor
public class OgController {

    private final StockService stockService;

    @GetMapping(value = "/stocks/{id}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> stockOg(@PathVariable String id) {
        Optional<StockResponse> opt = stockService.getAllStocks().stream()
                .filter(s -> s.channelId().equals(id))
                .findFirst();

        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        StockResponse stock = opt.get();
        BigDecimal price = stock.currentPrice();
        BigDecimal base = stock.basePrice().compareTo(BigDecimal.ZERO) > 0 ? stock.basePrice() : price;
        double pct = base.compareTo(BigDecimal.ZERO) > 0
                ? price.subtract(base).multiply(BigDecimal.valueOf(100)).divide(base, 2, java.math.RoundingMode.HALF_UP).doubleValue() : 0;
        String sign = pct >= 0 ? "+" : "";
        String formattedPrice = NumberFormat.getNumberInstance(Locale.KOREA).format(price);
        String formattedFollowers = NumberFormat.getNumberInstance(Locale.KOREA).format(stock.followerCount());

        String title = stock.streamerName() + " — Spotchzxk";
        String description = String.format("현재가 %s코인 (%s%.2f%%) · 팔로워 %s명",
                formattedPrice, sign, pct, formattedFollowers);
        String image = stock.profileImageUrl() != null ? stock.profileImageUrl() : "";
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

    @GetMapping(value = "/home", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> homeOg() {
        List<StockResponse> stocks = stockService.getAllStocks().stream()
                .filter(s -> s.currentPrice().compareTo(BigDecimal.ZERO) > 0)
                .sorted(Comparator.comparing(StockResponse::dailyTradingValue).reversed())
                .limit(20)
                .toList();

        NumberFormat nf = NumberFormat.getNumberInstance(Locale.KOREA);

        StringBuilder rows = new StringBuilder();
        for (StockResponse s : stocks) {
            BigDecimal price = s.currentPrice();
            BigDecimal base = s.basePrice().compareTo(BigDecimal.ZERO) > 0 ? s.basePrice() : price;
            double pct = base.compareTo(BigDecimal.ZERO) > 0
                    ? price.subtract(base).multiply(BigDecimal.valueOf(100))
                            .divide(base, 2, java.math.RoundingMode.HALF_UP).doubleValue()
                    : 0;
            String sign = pct >= 0 ? "+" : "";
            rows.append(String.format(
                    "<li><a href=\"https://spotchzxk.xyz/stocks/%s\">%s</a> — %s코인 (%s%.2f%%)</li>\n",
                    s.channelId(), s.streamerName(), nf.format(price), sign, pct));
        }

        String html = """
                <!DOCTYPE html>
                <html lang="ko">
                <head>
                  <meta charset="UTF-8">
                  <title>Spotchzxk — 치지직 스트리머 주식 거래소</title>
                  <meta name="description" content="치지직 버츄얼 스트리머를 주식처럼 매매하는 시뮬레이션 거래소. 버츄얼 주식·버주식·스트리머 주식·치지직 주식을 코인으로 자유롭게 거래할 수 있습니다.">
                  <meta name="keywords" content="치지직 주식, 스트리머 주식, 버츄얼 주식, 버주식, 치지직 버츄얼, 스트리머 투자, 치지직 거래소, 치지직 스트리머 주식, 버주">
                  <meta property="og:type" content="website">
                  <meta property="og:url" content="https://spotchzxk.xyz/">
                  <meta property="og:title" content="Spotchzxk — 치지직 스트리머 주식 거래소">
                  <meta property="og:description" content="좋아하는 치지직 버츄얼 스트리머에 투자하세요. 버주식·스트리머 주식을 코인으로 자유롭게 매매하는 시뮬레이션 거래소.">
                  <meta property="og:image" content="https://spotchzxk.xyz/og-image.png">
                  <meta name="twitter:card" content="summary_large_image">
                  <meta name="twitter:title" content="Spotchzxk — 치지직 스트리머 주식 거래소">
                  <meta name="twitter:description" content="좋아하는 치지직 버츄얼 스트리머에 투자하세요. 버주식·스트리머 주식을 코인으로 자유롭게 매매하는 시뮬레이션 거래소.">
                  <meta name="twitter:image" content="https://spotchzxk.xyz/og-image.png">
                  <meta http-equiv="refresh" content="0;url=https://spotchzxk.xyz/">
                </head>
                <body>
                  <h1>Spotchzxk — 치지직 스트리머 주식 거래소</h1>
                  <p>치지직 버츄얼 스트리머를 주식처럼 매매하는 시뮬레이션 거래소입니다. 버츄얼 주식(버주식)·스트리머 주식·치지직 주식을 코인으로 자유롭게 거래할 수 있습니다.</p>
                  <h2>거래량 상위 종목</h2>
                  <ul>
                  %s
                  </ul>
                </body>
                </html>
                """.formatted(rows);

        return ResponseEntity.ok(html);
    }
}
