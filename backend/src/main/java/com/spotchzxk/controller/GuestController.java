package com.spotchzxk.controller;

import com.google.firebase.auth.FirebaseAuthException;
import com.spotchzxk.dto.GuestRegisterRequest;
import com.spotchzxk.service.GuestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/guest")
@RequiredArgsConstructor
@Slf4j
public class GuestController {

    private final GuestService guestService;

    @PostMapping("/register")
    public ResponseEntity<Map<String, String>> register(@Valid @RequestBody GuestRegisterRequest req) {
        try {
            Map<String, String> result = guestService.registerGuest(req.getFingerprint(), req.getUid());
            return ResponseEntity.ok(result);
        } catch (FirebaseAuthException e) {
            log.warn("Failed to register guest uid {}: {}", req.getUid(), e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "인증 서비스 오류"));
        }
    }
}
