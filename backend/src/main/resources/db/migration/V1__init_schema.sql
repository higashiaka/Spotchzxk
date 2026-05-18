CREATE TABLE IF NOT EXISTS streamers (
    id               VARCHAR(100)   NOT NULL,
    name             VARCHAR(200)   NOT NULL,
    price            DECIMAL(12,2)  NOT NULL DEFAULT 100.00,
    total_volume     BIGINT         NOT NULL DEFAULT 0,
    issued_shares    INT            NOT NULL DEFAULT 0,
    total_supply     INT            NOT NULL DEFAULT 0,
    chzzk_channel_id VARCHAR(100),
    followers        INT,
    created_at       DATETIME       NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS portfolios (
    user_id  VARCHAR(128)  NOT NULL,
    balance  DECIMAL(14,2) NOT NULL DEFAULT 10000.00,
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS portfolio_shares (
    user_id     VARCHAR(128) NOT NULL,
    streamer_id VARCHAR(100) NOT NULL,
    quantity    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, streamer_id),
    CONSTRAINT fk_ps_user    FOREIGN KEY (user_id)     REFERENCES portfolios(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_ps_streamer FOREIGN KEY (streamer_id) REFERENCES streamers(id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
    id              VARCHAR(36)        NOT NULL,
    user_id         VARCHAR(128)       NOT NULL,
    streamer_id     VARCHAR(100)       NOT NULL,
    type            ENUM('buy','sell') NOT NULL,
    quantity        INT                NOT NULL,
    estimated_price DECIMAL(12,2)      NOT NULL,
    executed_price  DECIMAL(12,2),
    status          VARCHAR(20)        NOT NULL DEFAULT 'completed',
    created_at      BIGINT             NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_orders_user_id    (user_id),
    INDEX idx_orders_streamer_id (streamer_id),
    INDEX idx_orders_created_at  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admins (
    user_id VARCHAR(128) NOT NULL,
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_mappings (
    fingerprint VARCHAR(128) NOT NULL,
    uid         VARCHAR(128) NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (fingerprint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
