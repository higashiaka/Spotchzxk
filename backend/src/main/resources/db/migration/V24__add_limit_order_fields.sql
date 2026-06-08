-- Extend the orders table to support limit orders
ALTER TABLE orders
    ADD COLUMN order_mode  VARCHAR(10)    NOT NULL DEFAULT 'market' COMMENT 'order type: market|limit',
    ADD COLUMN limit_price DECIMAL(12,2)  NULL     COMMENT 'limit price (set only for limit orders)',
    MODIFY COLUMN status   VARCHAR(20)    NOT NULL DEFAULT 'completed' COMMENT 'completed|pending|cancelled';

-- Index for querying pending limit orders
CREATE INDEX idx_orders_streamer_status ON orders (streamer_id, status);
CREATE INDEX idx_orders_user_status     ON orders (user_id, status);
