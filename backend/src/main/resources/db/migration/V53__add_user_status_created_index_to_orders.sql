SET @index_exists := (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'orders'
      AND index_name = 'idx_orders_user_status_created'
);

SET @create_index_sql := IF(
    @index_exists = 0,
    'CREATE INDEX idx_orders_user_status_created ON orders (user_id, status, created_at)',
    'SELECT 1'
);

PREPARE create_index_stmt FROM @create_index_sql;
EXECUTE create_index_stmt;
DEALLOCATE PREPARE create_index_stmt;
