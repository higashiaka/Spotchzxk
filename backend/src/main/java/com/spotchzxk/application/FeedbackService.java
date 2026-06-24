package com.spotchzxk.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spotchzxk.domain.feedback.entity.FeedbackSubmission;
import com.spotchzxk.domain.feedback.repository.FeedbackSubmissionRepository;
import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.presentation.dto.FeedbackRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FeedbackService {

    private final FeedbackSubmissionRepository feedbackRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    @Value("${app.feedback.discord-webhook-url:}")
    private String discordWebhookUrl;

    @Transactional
    public FeedbackSubmission submit(String uid, FeedbackRequest request) {
        User user = userRepository.findById(uid).orElse(null);
        FeedbackSubmission submission = feedbackRepository.save(FeedbackSubmission.builder()
                .id(UUID.randomUUID().toString())
                .userId(uid)
                .userDisplayName(user != null ? user.getDisplayName() : null)
                .category(request.category())
                .title(request.title().trim())
                .content(request.content().trim())
                .pageUrl(blankToNull(request.pageUrl()))
                .status("RECEIVED")
                .createdAt(LocalDateTime.now())
                .build());

        sendDiscordNotification(submission);
        return submission;
    }

    private void sendDiscordNotification(FeedbackSubmission feedback) {
        if (discordWebhookUrl == null || discordWebhookUrl.isBlank()) return;
        try {
            String message = """
                    **새 문의가 접수되었습니다**
                    접수번호: `%s`
                    유형: `%s`
                    사용자: `%s` (`%s`)
                    제목: **%s**
                    내용:
                    %s
                    페이지: %s
                    """.formatted(
                    feedback.getId(), feedback.getCategory(),
                    safe(feedback.getUserDisplayName()), feedback.getUserId(),
                    discordSafe(feedback.getTitle()), discordSafe(feedback.getContent()),
                    safe(feedback.getPageUrl()));
            if (message.length() > 1900) message = message.substring(0, 1900) + "\n…";

            String body = objectMapper.writeValueAsString(Map.of("content", message));
            HttpRequest request = HttpRequest.newBuilder(URI.create(discordWebhookUrl))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();
            HttpClient.newHttpClient().sendAsync(request, HttpResponse.BodyHandlers.discarding())
                    .exceptionally(error -> null);
        } catch (Exception ignored) {
            // Notification failures must never discard a successfully saved submission.
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String safe(String value) {
        return value == null || value.isBlank() ? "-" : value;
    }

    private String discordSafe(String value) {
        return safe(value).replace("@", "@\u200B");
    }
}
