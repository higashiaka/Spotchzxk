-- 지정가 주문 지원을 위한 orders 테이블 확장
ALTER TABLE orders
    ADD COLUMN order_mode  VARCHAR(10)    NOT NULL DEFAULT 'market' COMMENT '주문방식: market|limit',
    ADD COLUMN limit_price DECIMAL(12,2)  NULL     COMMENT '지정가 (limit 주문 시에만 설정)',
    MODIFY COLUMN status   VARCHAR(20)    NOT NULL DEFAULT 'completed' COMMENT 'completed|pending|cancelled';

-- 미체결 지정가 주문 조회용 인덱스
CREATE INDEX idx_orders_streamer_status ON orders (streamer_id, status);
CREATE INDEX idx_orders_user_status     ON orders (user_id, status);
