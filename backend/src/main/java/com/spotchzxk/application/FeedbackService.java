package com.spotchzxk.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spotchzxk.domain.feedback.entity.FeedbackSubmission;
import com.spotchzxk.domain.feedback.repository.FeedbackSubmissionRepository;
import com.spotchzxk.domain.feedback.entity.FeedbackReply;
import com.spotchzxk.domain.feedback.repository.FeedbackReplyRepository;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.presentation.dto.FeedbackRequest;
import com.spotchzxk.infrastructure.discord.DiscordFeedbackBot;
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
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FeedbackService {

    private final FeedbackSubmissionRepository feedbackRepository;
    private final FeedbackReplyRepository feedbackReplyRepository;
    private final UserRepository userRepository;
    private final StockRepository stockRepository;
    private final ObjectMapper objectMapper;
    private final DiscordFeedbackBot discordFeedbackBot;

    @Value("${app.feedback.discord-webhook-url:}")
    private String discordWebhookUrl;

    @Transactional
    public FeedbackSubmission submit(String uid, FeedbackRequest request) {
        User user = userRepository.findById(uid).orElse(null);
        Stock stock = request.stockId() == null || request.stockId().isBlank()
                ? null
                : stockRepository.findById(request.stockId().trim())
                        .orElseThrow(() -> new IllegalArgumentException("선택한 종목을 찾을 수 없습니다."));
        FeedbackSubmission submission = feedbackRepository.save(FeedbackSubmission.builder()
                .id(UUID.randomUUID().toString())
                .userId(uid)
                .userDisplayName(user != null ? user.getDisplayName() : null)
                .stockId(stock != null ? stock.getChannelId() : null)
                .stockName(stock != null ? stock.getStreamerName() : null)
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

    @Transactional(readOnly = true)
    public List<Map<String, Object>> findMine(String uid) {
        return feedbackRepository.findByUserIdOrderByCreatedAtDesc(uid).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> findRecent() {
        return feedbackRepository.findTop100ByOrderByCreatedAtDesc().stream()
                .map(this::toAdminResponse)
                .toList();
    }

    @Transactional
    public Map<String, Object> answer(String id, String answer) {
        if (answer == null || answer.isBlank()) {
            throw new IllegalArgumentException("답변 내용을 입력해 주세요.");
        }
        if (answer.length() > 3000) {
            throw new IllegalArgumentException("답변은 3,000자 이하로 입력해 주세요.");
        }
        FeedbackSubmission feedback = feedbackRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("문의를 찾을 수 없습니다."));
        feedback.markAnswered();
        feedbackRepository.save(feedback);
        feedbackReplyRepository.save(FeedbackReply.builder()
                .feedbackId(feedback.getId())
                .content(answer.trim())
                .createdAt(LocalDateTime.now())
                .build());
        return toAdminResponse(feedback);
    }

    private Map<String, Object> toResponse(FeedbackSubmission feedback) {
        Map<String, Object> response = new java.util.LinkedHashMap<>();
        response.put("id", feedback.getId());
        response.put("category", feedback.getCategory());
        response.put("title", feedback.getTitle());
        response.put("content", feedback.getContent());
        response.put("stockId", feedback.getStockId());
        response.put("stockName", feedback.getStockName());
        response.put("status", feedback.getStatus());
        response.put("answer", feedback.getAnswer());
        response.put("answeredAt", feedback.getAnsweredAt());
        response.put("replies", feedbackReplyRepository.findByFeedbackIdOrderByCreatedAtAsc(feedback.getId()).stream()
                .map(reply -> Map.of(
                        "id", reply.getId(),
                        "content", reply.getContent(),
                        "createdAt", reply.getCreatedAt()
                ))
                .toList());
        response.put("createdAt", feedback.getCreatedAt());
        return response;
    }

    private Map<String, Object> toAdminResponse(FeedbackSubmission feedback) {
        Map<String, Object> response = new java.util.LinkedHashMap<>(toResponse(feedback));
        response.put("userId", feedback.getUserId());
        response.put("userDisplayName", feedback.getUserDisplayName());
        response.put("pageUrl", feedback.getPageUrl());
        return response;
    }

    private void sendDiscordNotification(FeedbackSubmission feedback) {
        try {
            String message = """
                    **새 문의가 접수되었습니다**
                    접수번호: `%s`
                    유형: `%s`
                    사용자: `%s` (`%s`)
                    종목: `%s`
                    제목: **%s**
                    내용:
                    %s
                    페이지: %s
                    """.formatted(
                    feedback.getId(), feedback.getCategory(),
                    safe(feedback.getUserDisplayName()), feedback.getUserId(),
                    feedback.getStockId() == null
                            ? "-"
                            : discordSafe(feedback.getStockName()) + " (`" + feedback.getStockId() + "`)",
                    discordSafe(feedback.getTitle()), discordSafe(feedback.getContent()),
                    safe(feedback.getPageUrl()));
            if (message.length() > 1900) message = message.substring(0, 1900) + "\n…";

            if (discordFeedbackBot.isConfigured()) {
                discordFeedbackBot.sendSubmission(feedback, message);
                return;
            }
            if (discordWebhookUrl == null || discordWebhookUrl.isBlank()) return;

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
