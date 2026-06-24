ALTER TABLE feedback_submissions
    MODIFY COLUMN id VARCHAR(36) NOT NULL,
    ADD COLUMN stock_id VARCHAR(50) NULL AFTER user_display_name,
    ADD COLUMN stock_name VARCHAR(100) NULL AFTER stock_id;
