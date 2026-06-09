package com.spotchzxk.controller;

import com.spotchzxk.dto.GuestPrecheckRequest;
import com.spotchzxk.dto.GuestRegisterRequest;
import com.spotchzxk.service.GuestAbuseProtectionService;
import com.spotchzxk.service.GuestService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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

    @PostMapping("/precheck")
    public ResponseEntity<Map<String, Object>> precheck(@Valid @RequestBody GuestPrecheckRequest req,
                                                        HttpServletRequest request) {
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
        if (!guestService.exists(uid)) {
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
