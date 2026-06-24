package com.spotchzxk.domain.feedback.repository;

import com.spotchzxk.domain.feedback.entity.FeedbackSubmission;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FeedbackSubmissionRepository extends JpaRepository<FeedbackSubmission, String> {
}
