SET @col_exists = (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'stocks'
      AND COLUMN_NAME = 'trading_suspension_reason'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE stocks ADD COLUMN trading_suspension_reason VARCHAR(50) NULL',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
