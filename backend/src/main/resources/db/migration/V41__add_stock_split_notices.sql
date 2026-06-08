CREATE TABLE stock_split_notices (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    split_date DATE NOT NULL,
    threshold_price INT NOT NULL,
    split_ratio INT NOT NULL,
    stock_count INT NOT NULL,
    stock_names TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX ux_stock_split_notices_split_date
    ON stock_split_notices (split_date);
