CREATE TABLE stock_split_events (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    channel_id VARCHAR(50) NOT NULL,
    split_ratio INT NOT NULL,
    executed_at BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX ix_stock_split_events_channel_executed
    ON stock_split_events (channel_id, executed_at);
