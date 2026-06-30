SET @add_title_stock_name_snapshot = (
    SELECT IF(
        COUNT(*) = 0,
        'ALTER TABLE titles ADD COLUMN stock_name_snapshot VARCHAR(100) NULL COMMENT ''Streamer name snapshot for stock-scoped titles''',
        'SELECT 1'
    )
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'titles'
      AND column_name = 'stock_name_snapshot'
);

PREPARE add_title_stock_name_snapshot_stmt FROM @add_title_stock_name_snapshot;
EXECUTE add_title_stock_name_snapshot_stmt;
DEALLOCATE PREPARE add_title_stock_name_snapshot_stmt;

UPDATE titles t
JOIN stocks s ON t.stock_id COLLATE utf8mb4_unicode_ci = s.channel_id COLLATE utf8mb4_unicode_ci
SET t.stock_name_snapshot = s.streamer_name
WHERE t.stock_id IS NOT NULL
  AND t.stock_name_snapshot IS NULL;
