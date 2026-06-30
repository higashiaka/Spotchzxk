package com.spotchzxk.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

@Service
@Slf4j
public class NaverOAuthService {

    @Value("${app.naver.client-id}")
    private String clientId;

    @Value("${app.naver.client-secret}")
    private String clientSecret;

    @Value("${app.naver.redirect-uri}")
    private String redirectUri;

    private static final String TOKEN_URL = "https://nid.naver.com/oauth2.0/token";
    private static final String PROFILE_URL = "https://openapi.naver.com/v1/nid/me";
    private static final HttpClient HTTP_CLIENT = HttpClient.newHttpClient();
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public String createFirebaseCustomToken(String code, String state) {
        String accessToken = fetchAccessToken(code, state);
        String naverId = fetchNaverId(accessToken);
        String uid = "naver:" + naverId;
        try {
            return FirebaseAuth.getInstance().createCustomToken(uid);
        } catch (FirebaseAuthException e) {
            log.error("Failed to create Firebase custom token for Naver uid={}", naverId, e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create auth token");
        }
    }

    private String fetchAccessToken(String code, String state) {
        String body = "grant_type=authorization_code"
                + "&client_id=" + encode(clientId)
                + "&client_secret=" + encode(clientSecret)
                + "&code=" + encode(code)
                + "&state=" + encode(state)
                + "&redirect_uri=" + encode(redirectUri);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(TOKEN_URL))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        try {
            HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode node = MAPPER.readTree(response.body());
            String token = node.path("access_token").asText(null);
            if (token == null || token.isBlank()) {
                log.error("Naver token exchange failed: {}", response.body());
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Naver token exchange failed");
            }
            return token;
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Naver token request failed");
        }
    }

    private String fetchNaverId(String accessToken) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(PROFILE_URL))
                .header("Authorization", "Bearer " + accessToken)
                .GET()
                .build();
        try {
            HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode node = MAPPER.readTree(response.body());
            String id = node.path("response").path("id").asText(null);
            if (id == null || id.isBlank()) {
                log.error("Naver profile fetch failed: {}", response.body());
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Failed to fetch Naver profile");
            }
            return id;
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Naver profile request failed");
        }
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
