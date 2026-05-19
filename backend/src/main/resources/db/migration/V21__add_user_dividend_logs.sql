CREATE TABLE IF NOT EXISTS user_dividend_logs (
    id            BIGINT AUTO_INCREMENT NOT NULL,
    user_id       VARCHAR(128) NOT NULL,
    channel_id    VARCHAR(50)  NOT NULL,
    streamer_name VARCHAR(100) NOT NULL,
    profile_image_url TEXT,
    quantity      BIGINT       NOT NULL,
    rate_per_share DECIMAL(14, 4) NOT NULL,
    amount        DECIMAL(14,  2) NOT NULL,
    created_at    DATETIME     DEFAULT NOW(),
    PRIMARY KEY (id),
    INDEX idx_udl_user_id (user_id),
    INDEX idx_udl_created_at (created_at)
);
