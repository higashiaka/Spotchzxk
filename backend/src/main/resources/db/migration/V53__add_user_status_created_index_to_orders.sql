CREATE INDEX idx_orders_user_status_created ON orders (user_id, status, created_at);
