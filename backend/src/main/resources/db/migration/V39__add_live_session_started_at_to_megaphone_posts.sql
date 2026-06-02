ALTER TABLE megaphone_posts
    ADD COLUMN live_session_started_at DATETIME NULL,
    ADD INDEX idx_megaphone_live_session (channel_id, live_session_started_at, created_at);
