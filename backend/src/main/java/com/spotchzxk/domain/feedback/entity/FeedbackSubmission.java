package com.spotchzxk.domain.feedback.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "feedback_submissions")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class FeedbackSubmission {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "user_id", nullable = false, length = 128)
    private String userId;

    @Column(name = "user_display_name", length = 20)
    private String userDisplayName;

    @Column(name = "stock_id", length = 50)
    private String stockId;

    @Column(name = "stock_name", length = 100)
    private String stockName;

    @Column(nullable = false, length = 30)
    private String category;

    @Column(nullable = false, length = 100)
    private String title;

    @Lob
    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "page_url", length = 500)
    private String pageUrl;

    @Column(name = "discord_message_id", length = 32, unique = true)
    private String discordMessageId;

    @Column(nullable = false, length = 20)
    private String status;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String answer;

    @Column(name = "answered_at")
    private LocalDateTime answeredAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public void answer(String answer) {
        this.answer = answer;
        this.answeredAt = LocalDateTime.now();
        this.status = "ANSWERED";
    }

    public void attachDiscordMessage(String messageId) {
        this.discordMessageId = messageId;
    }
}
