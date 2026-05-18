package com.spotchzxk.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.exception.ChannelNotFoundException;
import com.spotchzxk.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class StockService {

    private final StockRepository stockRepository;
    private final SimpMessagingTemplate messagingTemplate;
    
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public List<Stock> getAllStocks() {
        return stockRepository.findAll();
    }

    /**
     * @return empty if stock already exists (duplicate), filled if newly created with Chzzk API name
     */
    @Transactional
    public Optional<Stock> addStockIfNew(String channelId) {
        if (stockRepository.existsById(channelId)) {
            return Optional.empty(); // 이미 존재
        }

        // 기본 정보 빌드
        Stock stock = Stock.builder()
                .channelId(channelId)
                .streamerName(channelId)
                .totalSupply(0L)
                .currentPrice(1000)
                .basePrice(1000)
                .isLive(false)
                .listedAt(java.time.LocalDateTime.now())
                .build();

        // 치지직 공식 OpenAPI를 통해 실제 스트리머 정보 받아오기 (채널 미존재 시 예외)
        boolean channelFound = fetchChzzkChannelInfo(stock);
        if (!channelFound) {
            throw new ChannelNotFoundException(channelId);
        }

        Stock savedStock = stockRepository.save(stock);

        // 전체 목록 브로드캐스트 → 프론트 즉시 반영
        messagingTemplate.convertAndSend("/topic/streamers", stockRepository.findAll());
        return Optional.of(savedStock);
    }

    private String getEnvOrProperty(String key) {
        // 1. 시스템 환경변수에서 조회
        String value = System.getenv(key);
        if (value != null && !value.isBlank()) {
            return value;
        }

        // 2. frontend/.env 파일에서 동적으로 파싱 (로컬 개발 환경 대응)
        try {
            java.nio.file.Path envPath = java.nio.file.Paths.get("../frontend/.env");
            if (!java.nio.file.Files.exists(envPath)) {
                envPath = java.nio.file.Paths.get("frontend/.env");
            }
            if (java.nio.file.Files.exists(envPath)) {
                List<String> lines = java.nio.file.Files.readAllLines(envPath);
                for (String line : lines) {
                    line = line.trim();
                    if (line.startsWith(key + "=")) {
                        String rawVal = line.substring((key + "=").length()).trim();
                        // 앞뒤 따옴표 제거
                        if (rawVal.startsWith("\"") && rawVal.endsWith("\"")) {
                            rawVal = rawVal.substring(1, rawVal.length() - 1);
                        } else if (rawVal.startsWith("'") && rawVal.endsWith("'")) {
                            rawVal = rawVal.substring(1, rawVal.length() - 1);
                        }
                        return rawVal;
                    }
                }
            }
        } catch (Exception e) {
            // env 파일 로드 예외 무시
        }

        return null;
    }

    /**
     * @return true if channel exists and info was fetched, false if channel not found.
     *         Also returns true when credentials are missing (skips validation).
     */
    private boolean fetchChzzkChannelInfo(Stock stock) {
        String clientId = getEnvOrProperty("CHZZK_CLIENT_ID");
        String clientSecret = getEnvOrProperty("CHZZK_CLIENT_SECRET");

        if (clientId == null || clientId.isBlank() || clientSecret == null || clientSecret.isBlank()) {
            System.err.println("Chzzk Client Credentials are not set in environment or .env file.");
            return true; // 자격증명 없으면 검증 스킵
        }

        try {
            String url = "https://openapi.chzzk.naver.com/open/v1/channels?channelIds=" + stock.getChannelId();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Client-Id", clientId)
                    .header("Client-Secret", clientSecret)
                    .header("User-Agent", "Mozilla/5.0")
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                JsonNode root = objectMapper.readTree(response.body());
                JsonNode contentNode = root.get("content");
                if (contentNode != null && contentNode.has("data")) {
                    JsonNode dataArray = contentNode.get("data");
                    if (!dataArray.isArray() || dataArray.size() == 0) {
                        return false; // 채널 없음
                    }
                    JsonNode data = dataArray.get(0);
                    if (data.has("channelName")) {
                        stock.setStreamerName(data.get("channelName").asText());
                    }
                    if (data.has("channelImageUrl")) {
                        stock.setProfileImageUrl(data.get("channelImageUrl").asText());
                    }
                    if (data.has("followerCount")) {
                        stock.setFollowerCount(data.get("followerCount").asInt());
                    }
                    return true;
                }
                return false; // content 또는 data 없음
            } else {
                System.err.println("Failed to fetch Chzzk OpenAPI. Status: " + response.statusCode() + ", Body: " + response.body());
                return false;
            }
        } catch (Exception e) {
            System.err.println("Failed to fetch Chzzk info for channel ID: " + stock.getChannelId() + ". Error: " + e.getMessage());
            return false;
        }
    }
}
