package com.spotchzxk.presentation.controller;

import com.spotchzxk.presentation.dto.GuestPrecheckRequest;
import com.spotchzxk.presentation.dto.GuestRegisterRequest;
import com.spotchzxk.application.GuestAbuseProtectionService;
import com.spotchzxk.application.GuestService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/guest")
@RequiredArgsConstructor
@Slf4j
public class GuestController {

    private final GuestService guestService;
    private final GuestAbuseProtectionService guestAbuseProtectionService;

    @Value("${app.guest-login.enabled:false}")
    private boolean guestLoginEnabled;

    @PostMapping("/precheck")
    public ResponseEntity<Map<String, Object>> precheck(@Valid @RequestBody GuestPrecheckRequest req,
                                                        HttpServletRequest request) {
        if (!guestLoginEnabled) {
            return ResponseEntity.status(403).body(Map.of("error", "guest_login_disabled"));
        }

        var abuseCheck = guestAbuseProtectionService.checkAndRecord(request, req.fingerprintHash());
        if (!abuseCheck.allowed()) {
            return ResponseEntity.status(429)
                    .body(Map.of(
                            "error", "guest_network_temporarily_limited",
                            "retryAfterSeconds", abuseCheck.retryAfterSeconds()
                    ));
        }

        return ResponseEntity.ok(Map.of(
                "ok", true,
                "precheckToken", guestAbuseProtectionService.createPrecheckPermit(request, req.fingerprintHash())
        ));
    }

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@AuthenticationPrincipal String uid,
                                                        @RequestBody(required = false) GuestRegisterRequest req,
                                                        HttpServletRequest request) {
        if (!guestLoginEnabled) {
            return ResponseEntity.status(403).body(Map.of("error", "guest_login_disabled"));
        }

        if (uid == null || uid.isBlank()) {
            return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        }
        if (guestService.requiresPrecheckForGuestRegistration(uid)) {
            String precheckToken = req != null ? req.precheckToken() : null;
            String fingerprintHash = req != null ? req.fingerprintHash() : null;
            if (!guestAbuseProtectionService.consumePrecheckPermit(precheckToken, request, fingerprintHash)) {
                return ResponseEntity.status(429)
                        .body(Map.of(
                                "error", "guest_precheck_required",
                                "retryAfterSeconds", 300
                        ));
            }
        }

        Map<String, String> result = guestService.registerGuest(uid);
        return ResponseEntity.ok(Map.of("canonicalUid", result.get("canonicalUid")));
    }
}


