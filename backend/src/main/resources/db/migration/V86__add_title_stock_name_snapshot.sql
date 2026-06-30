ALTER TABLE titles
    ADD COLUMN stock_name_snapshot VARCHAR(100) NULL COMMENT 'Streamer name snapshot for stock-scoped titles';

UPDATE titles t
JOIN stocks s ON t.stock_id = s.channel_id
SET t.stock_name_snapshot = s.streamer_name
WHERE t.stock_id IS NOT NULL
  AND t.stock_name_snapshot IS NULL;
