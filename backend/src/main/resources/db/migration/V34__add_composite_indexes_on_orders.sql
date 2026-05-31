-- Covered by the composite index prefix.
DROP INDEX idx_orders_streamer_id ON orders;
DROP INDEX idx_orders_user_id     ON orders;

-- Candles: WHERE streamer_id = ? AND created_at >= ? ORDER BY created_at
CREATE INDEX idx_orders_streamer_created ON orders (streamer_id, created_at);

-- User orders: WHERE user_id = ? ORDER BY created_at DESC
CREATE INDEX idx_orders_user_created ON orders (user_id, created_at);
