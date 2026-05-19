package com.spotchzxk.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChzzkLivePollingService {

    private static final String LIVE_DETAIL_API =
            "https://api.chzzk.naver.com/service/v3/channels/%s/live-detail";

    private final StockRepository stockRepository;
    private final DividendService dividendService;
    private final SimpMessagingTemplate messagingTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    @Scheduled(fixedDelay = 60_000)
    @Transactional
    public void pollLiveStatus() {
        List<Stock> stocks = stockRepository.findAll();
        if (stocks.isEmpty()) return;

        String nidAut = getEnv("NID_AUT");
        String nidSes = getEnv("NID_SES");

        boolean anyChanged = false;
        for (Stock stock : stocks) {
            String status = fetchChannelStatus(stock.getChannelId(), nidAut, nidSes);
            if (status == null) continue;

            boolean isLiveNow = "OPEN".equals(status);
            boolean isBlocked = "BLOCK".equals(status);
            boolean wasLive = stock.isLive();

            if (!wasLive && isLiveNow) {
                stock.setLive(true);
                stock.setLiveStartedAt(LocalDateTime.now());
                stockRepository.save(stock);
                anyChanged = true;
                log.info("Stream started: channel={}", stock.getChannelId());

            } else if (wasLive && !isLiveNow) {
                if (!isBlocked) {
                    LocalDateTime startedAt = stock.getLiveStartedAt();
                    if (startedAt != null) {
                        long streamMinutes = Duration.between(startedAt, LocalDateTime.now()).toMinutes();
                        dividendService.payStreamEndDividend(stock, streamMinutes);
                    }
                } else {
                    log.warn("Channel {} ended with BLOCK. No dividend paid.", stock.getChannelId());
                }
                stock.setLive(false);
                stock.setLiveStartedAt(null);
                stockRepository.save(stock);
                anyChanged = true;
                log.info("Stream ended ({}): channel={}", status, stock.getChannelId());
            }
        }

        if (anyChanged) {
            messagingTemplate.convertAndSend("/topic/streamers", stockRepository.findAll());
        }
    }

    /**
     * @return "OPEN", "CLOSE", "BLOCK", or null if API call failed
     */
    private String fetchChannelStatus(String channelId, String nidAut, String nidSes) {
        try {
            String url = String.format(LIVE_DETAIL_API, channelId);
            String cookie = String.format("NID_AUT=%s; NID_SES=%s",
                    nidAut != null ? nidAut : "",
                    nidSes != null ? nidSes : "");

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("User-Agent", "Mozilla/5.0 (X11; Unix x86_64)")
                    .header("Cookie", cookie)
                    .header("Origin", "https://chzzk.naver.com")
                    .header("DNT", "1")
                    .header("Sec-GPC", "1")
                    .header("Connection", "keep-alive")
                    .header("Referer", "")
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Chzzk API returned {} for channel {}", response.statusCode(), channelId);
                return null;
            }

            JsonNode content = objectMapper.readTree(response.body()).path("content");
            String status = content.path("status").asText("");
            return status.isEmpty() ? "CLOSE" : status.toUpperCase();

        } catch (Exception e) {
            log.error("Failed to fetch live status for channel {}: {}", channelId, e.getMessage());
            return null;
        }
    }

    private String getEnv(String key) {
        String value = System.getenv(key);
        if (value != null && !value.isBlank()) return value;

        try {
            java.nio.file.Path envPath = java.nio.file.Paths.get("../frontend/.env");
            if (!java.nio.file.Files.exists(envPath)) {
                envPath = java.nio.file.Paths.get("frontend/.env");
            }
            if (java.nio.file.Files.exists(envPath)) {
                for (String line : java.nio.file.Files.readAllLines(envPath)) {
                    line = line.trim();
                    if (line.startsWith(key + "=")) {
                        String raw = line.substring((key + "=").length()).trim();
                        if ((raw.startsWith("\"") && raw.endsWith("\""))
                                || (raw.startsWith("'") && raw.endsWith("'"))) {
                            raw = raw.substring(1, raw.length() - 1);
                        }
                        return raw;
                    }
                }
            }
        } catch (Exception ignored) {}
        return null;
    }
}
