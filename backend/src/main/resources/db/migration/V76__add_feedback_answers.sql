ALTER TABLE feedback_submissions
    ADD COLUMN answer TEXT NULL AFTER content,
    ADD COLUMN answered_at DATETIME(6) NULL AFTER answer,
    ADD COLUMN discord_message_id VARCHAR(32) NULL AFTER page_url,
    ADD UNIQUE INDEX uk_feedback_discord_message (discord_message_id);
