SET @dbname = DATABASE();
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = 'stocks'
      AND COLUMN_NAME = 'listed_at'
);
SET @sql = IF(@col_exists > 0,
    'SELECT 1',
    'ALTER TABLE stocks ADD COLUMN listed_at DATETIME NOT NULL DEFAULT NOW()');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
