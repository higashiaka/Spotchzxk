-- =============================================================================
-- Flyway Migration V8: Re-create orders table to support user transaction history
-- =============================================================================

CREATE TABLE IF NOT EXISTS orders (
    id              VARCHAR(36)   NOT NULL,
    user_id         VARCHAR(128)  NOT NULL,
    streamer_id     VARCHAR(50)   NOT NULL,
    type            VARCHAR(10)   NOT NULL, -- 'buy' or 'sell'
    quantity        INT           NOT NULL,
    estimated_price DECIMAL(12,2) NOT NULL,
    executed_price  DECIMAL(12,2),
    status          VARCHAR(20)   NOT NULL DEFAULT 'completed',
    created_at      BIGINT        NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_orders_stock FOREIGN KEY (streamer_id) REFERENCES stocks(channel_id) ON DELETE CASCADE,
    INDEX idx_orders_user_id (user_id),
    INDEX idx_orders_streamer_id (streamer_id),
    INDEX idx_orders_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
