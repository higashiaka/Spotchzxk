SET @index_exists = (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'user_shares'
      AND index_name = 'idx_user_shares_channel_pre_user'
);

SET @sql = IF(
    @index_exists = 0,
    'CREATE INDEX idx_user_shares_channel_pre_user ON user_shares (channel_id, pre_stream_quantity, user_id)',
    'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
