CREATE TABLE trade_failure_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    streamer_id VARCHAR(50) NOT NULL,
    type VARCHAR(10) NOT NULL,
    quantity DECIMAL(65, 0),
    price DECIMAL(65, 6),
    order_mode VARCHAR(10),
    reason TEXT NOT NULL,
    failed_at BIGINT NOT NULL
);

CREATE INDEX idx_trade_failure_user ON trade_failure_logs (user_id);
CREATE INDEX idx_trade_failure_stock ON trade_failure_logs (streamer_id);
CREATE INDEX idx_trade_failure_time ON trade_failure_logs (failed_at);
