package com.spotchzxk.controller;

import com.spotchzxk.entity.MegaphonePost;
import com.spotchzxk.service.MegaphoneService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/shop")
@RequiredArgsConstructor
public class ShopController {

    private final MegaphoneService megaphoneService;

    @GetMapping("/megaphone/posts")
    public ResponseEntity<List<MegaphonePost>> getPosts() {
        return ResponseEntity.ok(megaphoneService.getRecentPosts());
    }

    @GetMapping("/megaphone/my-uses-today")
    public ResponseEntity<Map<String, Long>> getMyUsesToday(@AuthenticationPrincipal String uid) {
        if (uid == null || uid.isBlank()) {
            return ResponseEntity.ok(Map.of("count", 0L));
        }
        return ResponseEntity.ok(Map.of("count", megaphoneService.getMyUsesToday(uid)));
    }

    @PostMapping("/megaphone")
    public ResponseEntity<?> useMegaphone(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal String uid) {
        if (uid == null || uid.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "로그인이 필요합니다."));
        }
        String channelId = body.get("channelId");
        String message = body.get("message");
        if (channelId == null || channelId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "종목을 선택해주세요."));
        }
        try {
            MegaphonePost post = megaphoneService.useMegaphone(uid, channelId, message);
            return ResponseEntity.ok(post);
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
