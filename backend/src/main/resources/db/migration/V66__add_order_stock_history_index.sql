CREATE INDEX idx_orders_streamer_status_executed_created
    ON orders (streamer_id, status, executed_at, created_at);
