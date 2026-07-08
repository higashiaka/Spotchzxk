package com.spotchzxk.presentation.controller;

import com.spotchzxk.domain.megaphone.entity.MegaphonePost;
import com.spotchzxk.application.DailyAttendanceService;
import com.spotchzxk.application.MegaphoneService;
import com.spotchzxk.application.ShopItemService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/shop")
@RequiredArgsConstructor
public class ShopController {

    private final MegaphoneService megaphoneService;
    private final ShopItemService shopItemService;
    private final DailyAttendanceService dailyAttendanceService;

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
            return ResponseEntity.badRequest().body(Map.of("error", "채널을 선택해주세요."));
        }
        try {
            MegaphonePost post = megaphoneService.useMegaphone(uid, channelId, message);
            return ResponseEntity.ok(post);
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/items/purchase")
    public ResponseEntity<?> purchaseItem(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal String uid) {
        if (uid == null || uid.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "로그인이 필요합니다."));
        }
        try {
            return ResponseEntity.ok(shopItemService.purchase(uid, body.getOrDefault("item", "")));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/attendance")
    public ResponseEntity<?> getAttendance(@AuthenticationPrincipal String uid) {
        if (uid == null || uid.isBlank()) {
            Map<String, Object> response = new HashMap<>();
            response.put("claimed", false);
            response.put("claimedToday", false);
            response.put("streakDay", 0);
            response.put("rewardType", "cash");
            response.put("itemType", "");
            response.put("itemName", "");
            response.put("itemQuantity", 0);
            response.put("rewardAmount", 0);
            response.put("balance", 0);
            response.put("nicknameChangeTickets", 0);
            response.put("stockAddTickets", 0);
            response.put("megaphoneTickets", 0);
            response.put("nextMilestoneDay", 3);
            response.put("nextMilestoneReward", Map.of(
                    "rewardType", "item",
                    "rewardAmount", 0,
                    "itemType", "nickname-change-ticket",
                    "itemName", "Nickname Change Ticket",
                    "itemQuantity", 1
            ));
            return ResponseEntity.ok(response);
        }
        return ResponseEntity.ok(dailyAttendanceService.getStatus(uid));
    }

    @PostMapping("/attendance/claim")
    public ResponseEntity<?> claimAttendance(@AuthenticationPrincipal String uid) {
        if (uid == null || uid.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Login is required."));
        }
        try {
            return ResponseEntity.ok(dailyAttendanceService.claim(uid));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}


