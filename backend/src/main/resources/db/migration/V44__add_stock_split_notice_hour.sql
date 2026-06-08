ALTER TABLE stock_split_notices
    ADD COLUMN split_hour INT NOT NULL DEFAULT 9;

DROP INDEX ux_stock_split_notices_split_date ON stock_split_notices;

CREATE UNIQUE INDEX ux_stock_split_notices_split_date_hour
    ON stock_split_notices (split_date, split_hour);
