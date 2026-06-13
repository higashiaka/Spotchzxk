package com.spotchzxk.infrastructure.chzzk;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.application.EnvResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

@Component
@RequiredArgsConstructor
@Slf4j
public class ChzzkApiClient {

    private static final String CHANNEL_API =
            "https://openapi.chzzk.naver.com/open/v1/channels?channelIds=%s";
    private static final String LIVE_DETAIL_API =
            "https://api.chzzk.naver.com/service/v3/channels/%s/live-detail";

    private final EnvResolver envResolver;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    /**
     * @return true if the channel exists and info was fetched. Returns true
     * when credentials are missing so local development can skip validation.
     */
    public boolean populateChannelInfo(Stock stock) {
        String clientId = envResolver.get("CHZZK_CLIENT_ID");
        String clientSecret = envResolver.get("CHZZK_CLIENT_SECRET");

        if (isBlank(clientId) || isBlank(clientSecret)) {
            log.warn("Chzzk Client credentials are not set; skipping channel validation.");
            return true;
        }

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(String.format(CHANNEL_API, stock.getChannelId())))
                    .timeout(Duration.ofSeconds(5))
                    .header("Client-Id", clientId)
                    .header("Client-Secret", clientSecret)
                    .header("User-Agent", "Mozilla/5.0")
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Failed to fetch Chzzk OpenAPI. status={}, body={}", response.statusCode(), response.body());
                return false;
            }

            JsonNode dataArray = objectMapper.readTree(response.body()).path("content").path("data");
            if (!dataArray.isArray() || dataArray.isEmpty()) {
                return false;
            }

            JsonNode data = dataArray.get(0);
            if (data.has("channelName")) {
                stock.updateStreamerName(data.get("channelName").asText());
            }
            if (data.has("channelImageUrl")) {
                stock.updateProfileImageUrl(data.get("channelImageUrl").asText());
            }
            if (data.has("followerCount")) {
                stock.updateFollowerCount(data.get("followerCount").asLong());
            }
            return true;
        } catch (Exception e) {
            log.warn("Failed to fetch Chzzk info for channel {}: {}", stock.getChannelId(), e.getMessage());
            return false;
        }
    }

    /**
     * @return "OPEN", "CLOSE", "BLOCK" on success;
     *         "AUTH_FAILED" on 401/403 (system-wide cookie issue — do not count toward suspension);
     *         null on timeout or channel-specific failure.
     */
    public String fetchChannelStatus(String channelId) {
        String nidAut = envResolver.get("NID_AUT");
        String nidSes = envResolver.get("NID_SES");

        try {
            String cookie = String.format("NID_AUT=%s; NID_SES=%s",
                    nidAut != null ? nidAut : "",
                    nidSes != null ? nidSes : "");

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(String.format(LIVE_DETAIL_API, channelId)))
                    .timeout(Duration.ofSeconds(5))
                    .header("User-Agent", "Mozilla/5.0 (X11; Unix x86_64)")
                    .header("Cookie", cookie)
                    .header("Origin", "https://chzzk.naver.com")
                    .header("DNT", "1")
                    .header("Sec-GPC", "1")
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            int httpStatus = response.statusCode();
            if (httpStatus == 401 || httpStatus == 403) {
                log.warn("Chzzk API auth failure ({}) for channel {} — NID cookie may be expired", httpStatus, channelId);
                return "AUTH_FAILED";
            }
            if (httpStatus != 200) {
                log.warn("Chzzk API returned {} for channel {}", httpStatus, channelId);
                return null;
            }

            JsonNode content = objectMapper.readTree(response.body()).path("content");
            if (content.isNull() || content.isMissingNode()) {
                // content:null means channel is deleted or has not streamed for a long time
                log.warn("Chzzk API content null for channel {} — treating as inactive", channelId);
                return null;
            }
            String status = content.path("status").asText("");
            return status.isEmpty() ? "CLOSE" : status.toUpperCase();
        } catch (Exception e) {
            log.warn("Failed to fetch live status for channel {}: {}", channelId, e.getMessage());
            return null;
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}


