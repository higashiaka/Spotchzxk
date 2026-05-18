DROP TABLE IF EXISTS portfolio_shares;
DROP TABLE IF EXISTS portfolios;
DROP TABLE IF EXISTS streamers;
DROP TABLE IF EXISTS orders;

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(128) NOT NULL,
    coin_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stocks (
    channel_id VARCHAR(50) NOT NULL,
    streamer_name VARCHAR(100) NOT NULL,
    profile_image_url TEXT,
    follower_count INT DEFAULT 0,
    base_broadcast_hours INT DEFAULT 0,
    total_supply BIGINT NOT NULL DEFAULT 0,
    current_price INT DEFAULT 1000,
    is_live BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT NOW(),
    PRIMARY KEY (channel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_shares (
    share_id BIGINT AUTO_INCREMENT NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    channel_id VARCHAR(50) NOT NULL,
    quantity BIGINT NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
    PRIMARY KEY (share_id),
    CONSTRAINT fk_us_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_us_stock FOREIGN KEY (channel_id) REFERENCES stocks(channel_id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_stock (user_id, channel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dividend_logs (
    log_id BIGINT AUTO_INCREMENT NOT NULL,
    channel_id VARCHAR(50) NOT NULL,
    total_dividend_pool INT NOT NULL,
    payout_reason VARCHAR(255),
    created_at DATETIME DEFAULT NOW(),
    PRIMARY KEY (log_id),
    CONSTRAINT fk_dl_stock FOREIGN KEY (channel_id) REFERENCES stocks(channel_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
