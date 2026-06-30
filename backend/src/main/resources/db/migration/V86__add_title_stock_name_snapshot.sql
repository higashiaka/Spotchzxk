ALTER TABLE titles
    ADD COLUMN IF NOT EXISTS stock_name_snapshot VARCHAR(100) NULL COMMENT 'Streamer name snapshot for stock-scoped titles';

UPDATE titles t
JOIN stocks s ON t.stock_id COLLATE utf8mb4_unicode_ci = s.channel_id COLLATE utf8mb4_unicode_ci
SET t.stock_name_snapshot = s.streamer_name
WHERE t.stock_id IS NOT NULL
  AND t.stock_name_snapshot IS NULL;
