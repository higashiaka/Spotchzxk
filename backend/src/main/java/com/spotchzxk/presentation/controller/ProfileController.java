package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.ProfileService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
public class ProfileController {

    private final ProfileService profileService;

    @PostMapping("/nickname")
    public ResponseEntity<?> changeNickname(
            @AuthenticationPrincipal String uid,
            @RequestBody Map<String, String> body
    ) {
        try {
            String displayName = body.getOrDefault("displayName", "");
            profileService.changeNickname(uid, displayName);
            return ResponseEntity.ok(Map.of("displayName", displayName.trim()));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/ranking-nickname-public")
    public ResponseEntity<?> updateRankingNicknamePublic(
            @AuthenticationPrincipal String uid,
            @RequestBody Map<String, Boolean> body
    ) {
        try {
            boolean isPublic = Boolean.TRUE.equals(body.get("isPublic"));
            profileService.updateRankingNicknamePublic(uid, isPublic);
            return ResponseEntity.ok(Map.of("rankingNicknamePublic", isPublic));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/profile-image")
    public ResponseEntity<?> updateProfileImage(
            @AuthenticationPrincipal String uid,
            @RequestBody Map<String, String> body
    ) {
        try {
            String profileImageUrl = body.getOrDefault("profileImageUrl", "");
            profileService.updateProfileImageUrl(uid, profileImageUrl);
            return ResponseEntity.ok(Map.of("profileImageUrl", profileImageUrl.trim()));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}


