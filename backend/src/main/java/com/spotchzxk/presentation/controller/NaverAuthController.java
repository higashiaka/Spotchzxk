package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.NaverOAuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/auth/naver")
@RequiredArgsConstructor
public class NaverAuthController {

    private final NaverOAuthService naverOAuthService;

    @PostMapping("/token")
    public Map<String, String> getCustomToken(@RequestBody Map<String, String> body) {
        String code = body.get("code");
        String state = body.get("state");
        if (code == null || code.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "code is required");
        }
        String customToken = naverOAuthService.createFirebaseCustomToken(code, state != null ? state : "");
        return Map.of("customToken", customToken);
    }
}
