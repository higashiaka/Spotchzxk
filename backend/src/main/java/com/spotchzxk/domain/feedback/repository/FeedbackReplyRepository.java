package com.spotchzxk.domain.feedback.repository;

import com.spotchzxk.domain.feedback.entity.FeedbackReply;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FeedbackReplyRepository extends JpaRepository<FeedbackReply, Long> {
    List<FeedbackReply> findByFeedbackIdOrderByCreatedAtAsc(String feedbackId);
    boolean existsByDiscordMessageId(String discordMessageId);
}
