CREATE TABLE feedback_replies (
    id BIGINT NOT NULL AUTO_INCREMENT,
    feedback_id VARCHAR(36) NOT NULL,
    content TEXT NOT NULL,
    discord_message_id VARCHAR(32) NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_feedback_reply_discord_message (discord_message_id),
    INDEX idx_feedback_reply_feedback_created (feedback_id, created_at),
    CONSTRAINT fk_feedback_reply_submission
        FOREIGN KEY (feedback_id) REFERENCES feedback_submissions(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO feedback_replies (feedback_id, content, created_at)
SELECT id, answer, COALESCE(answered_at, created_at)
FROM feedback_submissions
WHERE answer IS NOT NULL AND answer <> '';
