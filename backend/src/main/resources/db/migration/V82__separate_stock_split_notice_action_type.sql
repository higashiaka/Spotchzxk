ALTER TABLE stock_split_notices
    ADD COLUMN action_type VARCHAR(30) NOT NULL DEFAULT 'STOCK_SPLIT' AFTER split_hour;

UPDATE stock_split_notices
   SET action_type = 'REVERSE_STOCK_SPLIT'
 WHERE split_ratio < 0;

DROP INDEX ux_stock_split_notices_split_date_hour ON stock_split_notices;

CREATE UNIQUE INDEX ux_stock_split_notices_split_date_hour_action
    ON stock_split_notices (split_date, split_hour, action_type);
