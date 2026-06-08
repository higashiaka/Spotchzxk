-- Replace the index created in V24 on (streamer_id, status) with (streamer_id, status, created_at).
-- Ensures findByStreamerIdAndStatusOrderByCreatedAtAsc can cover sorting entirely via index.
DROP INDEX idx_orders_streamer_status ON orders;
CREATE INDEX idx_orders_streamer_status ON orders (streamer_id, status, created_at);
