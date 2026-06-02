ALTER TABLE dividend_logs
    MODIFY total_dividend_pool DECIMAL(20, 2) NOT NULL;

ALTER TABLE user_dividend_logs
    MODIFY rate_per_share DECIMAL(20, 4) NOT NULL,
    MODIFY amount DECIMAL(20, 2) NOT NULL;

ALTER TABLE users
    MODIFY coin_balance DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
    MODIFY dividend_total DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
    MODIFY realized_profit DECIMAL(20, 2) NOT NULL DEFAULT 0.00;
