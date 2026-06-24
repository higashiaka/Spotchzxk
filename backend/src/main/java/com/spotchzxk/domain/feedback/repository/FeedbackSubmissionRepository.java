package com.spotchzxk.domain.feedback.repository;

import com.spotchzxk.domain.feedback.entity.FeedbackSubmission;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FeedbackSubmissionRepository extends JpaRepository<FeedbackSubmission, String> {
    List<FeedbackSubmission> findByUserIdOrderByCreatedAtDesc(String userId);
    List<FeedbackSubmission> findTop100ByOrderByCreatedAtDesc();
    Optional<FeedbackSubmission> findByDiscordMessageId(String discordMessageId);
}
