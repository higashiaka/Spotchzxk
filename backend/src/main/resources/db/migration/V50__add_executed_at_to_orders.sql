-- Separate execution time from order creation time for limit orders
ALTER TABLE orders
    ADD COLUMN executed_at BIGINT NULL COMMENT 'epoch ms when order was filled; NULL until filled';
