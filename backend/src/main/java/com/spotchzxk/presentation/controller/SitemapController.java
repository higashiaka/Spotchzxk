package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.StockService;
import com.spotchzxk.presentation.dto.StockResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;

@RestController
@RequiredArgsConstructor
public class SitemapController {

    private static final String BASE_URL = "https://spotchzxk.xyz";
    private static final Duration CACHE_DURATION = Duration.ofHours(1);
    private final StockService stockService;
    private volatile String cachedSitemap;
    private volatile long cacheExpiresAt;

    @GetMapping(value = "/sitemap.xml", produces = MediaType.APPLICATION_XML_VALUE)
    public ResponseEntity<String> sitemap() {
        String sitemap = getCachedSitemap();

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(CACHE_DURATION).cachePublic())
                .body(sitemap);
    }

    private String getCachedSitemap() {
        long now = System.currentTimeMillis();
        String sitemap = cachedSitemap;
        if (sitemap != null && now < cacheExpiresAt) {
            return sitemap;
        }

        synchronized (this) {
            now = System.currentTimeMillis();
            if (cachedSitemap != null && now < cacheExpiresAt) {
                return cachedSitemap;
            }

            cachedSitemap = buildSitemap(stockService.getAllStocks());
            cacheExpiresAt = now + CACHE_DURATION.toMillis();
            return cachedSitemap;
        }
    }

    private String buildSitemap(List<StockResponse> stocks) {
        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");

        sb.append("  <url>\n");
        sb.append("    <loc>").append(BASE_URL).append("/</loc>\n");
        sb.append("    <changefreq>hourly</changefreq>\n");
        sb.append("    <priority>1.0</priority>\n");
        sb.append("  </url>\n");

        for (StockResponse stock : stocks) {
            sb.append("  <url>\n");
            sb.append("    <loc>").append(BASE_URL).append("/stocks/").append(stock.channelId()).append("</loc>\n");
            sb.append("    <changefreq>hourly</changefreq>\n");
            sb.append("    <priority>0.8</priority>\n");
            sb.append("  </url>\n");
        }

        sb.append("</urlset>");
        return sb.toString();
    }
}
