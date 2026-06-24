package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.FeedbackService;
import com.spotchzxk.domain.feedback.entity.FeedbackSubmission;
import com.spotchzxk.presentation.dto.FeedbackRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/feedback")
@RequiredArgsConstructor
public class FeedbackController {

    private final FeedbackService feedbackService;

    @GetMapping
    public ResponseEntity<?> mine(@AuthenticationPrincipal String uid) {
        return ResponseEntity.ok(feedbackService.findMine(uid));
    }

    @PostMapping
    public ResponseEntity<?> submit(
            @AuthenticationPrincipal String uid,
            @Valid @RequestBody FeedbackRequest request) {
        try {
            FeedbackSubmission saved = feedbackService.submit(uid, request);
            return ResponseEntity.ok(Map.of(
                    "id", saved.getId(),
                    "status", saved.getStatus(),
                    "createdAt", saved.getCreatedAt()
            ));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(429).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
