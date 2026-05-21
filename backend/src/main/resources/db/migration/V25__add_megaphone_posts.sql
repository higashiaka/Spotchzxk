CREATE TABLE megaphone_posts (
    id          VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id     VARCHAR(128) NOT NULL,
    channel_id  VARCHAR(50)  NOT NULL,
    streamer_name VARCHAR(100) NOT NULL,
    message     VARCHAR(100),
    live_url    VARCHAR(200) NOT NULL,
    created_at  DATETIME(3)  NOT NULL,
    INDEX idx_megaphone_user_date (user_id, created_at),
    INDEX idx_megaphone_created (created_at)
);
