CREATE TABLE feedback_submissions (
    id CHAR(36) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    user_display_name VARCHAR(20) NULL,
    category VARCHAR(30) NOT NULL,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    page_url VARCHAR(500) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_feedback_user_created (user_id, created_at),
    INDEX idx_feedback_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
