-- users: remaining non-max columns
ALTER TABLE users
    MODIFY donation_total        DECIMAL(65, 2) NOT NULL DEFAULT 0.00,
    MODIFY reset_count           BIGINT         NOT NULL DEFAULT 0,
    MODIFY nickname_change_tickets BIGINT        NOT NULL DEFAULT 0,
    MODIFY stock_add_tickets     BIGINT         NOT NULL DEFAULT 0;

-- orders: price columns
ALTER TABLE orders
    MODIFY estimated_price DECIMAL(65, 2) NOT NULL,
    MODIFY executed_price  DECIMAL(65, 2) NULL,
    MODIFY limit_price     DECIMAL(65, 2) NULL;

-- dividend_logs
ALTER TABLE dividend_logs
    MODIFY total_dividend_pool DECIMAL(65, 2) NOT NULL;

-- user_dividend_logs
ALTER TABLE user_dividend_logs
    MODIFY rate_per_share DECIMAL(65, 4) NOT NULL,
    MODIFY amount         DECIMAL(65, 2) NOT NULL;

-- user_shares
ALTER TABLE user_shares
    MODIFY avg_price DECIMAL(65, 2) NULL;

-- stocks: int columns → bigint
ALTER TABLE stocks
    MODIFY follower_count        BIGINT NOT NULL DEFAULT 0,
    MODIFY base_broadcast_hours  BIGINT NOT NULL DEFAULT 0,
    MODIFY liquidity_tier        BIGINT NOT NULL DEFAULT 1;
