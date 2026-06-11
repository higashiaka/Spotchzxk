ALTER TABLE orders
    MODIFY COLUMN estimated_price DECIMAL(20,2) NOT NULL,
    MODIFY COLUMN executed_price  DECIMAL(20,2) NULL,
    MODIFY COLUMN limit_price     DECIMAL(20,2) NULL;
