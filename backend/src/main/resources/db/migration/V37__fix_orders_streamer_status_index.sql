-- V24에서 (streamer_id, status)로 생성된 인덱스를 (streamer_id, status, created_at)으로 교체.
-- findByStreamerIdAndStatusOrderByCreatedAtAsc 쿼리가 인덱스만으로 정렬까지 커버하도록.
DROP INDEX idx_orders_streamer_status ON orders;
CREATE INDEX idx_orders_streamer_status ON orders (streamer_id, status, created_at);
