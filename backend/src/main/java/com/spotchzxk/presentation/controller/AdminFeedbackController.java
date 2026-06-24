package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.FeedbackService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/feedback")
@RequiredArgsConstructor
public class AdminFeedbackController {

    private final FeedbackService feedbackService;

    @GetMapping
    public ResponseEntity<?> list() {
        return ResponseEntity.ok(feedbackService.findRecent());
    }

    @PostMapping("/{id}/answer")
    public ResponseEntity<?> answer(@PathVariable String id, @RequestBody Map<String, Object> body) {
        try {
            return ResponseEntity.ok(feedbackService.answer(id, String.valueOf(body.getOrDefault("answer", ""))));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
