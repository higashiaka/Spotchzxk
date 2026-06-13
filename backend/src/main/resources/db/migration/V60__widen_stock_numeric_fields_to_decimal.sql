ALTER TABLE stocks
    MODIFY current_price    DECIMAL(65, 2) NOT NULL DEFAULT 0.00,
    MODIFY base_price       DECIMAL(65, 2) NOT NULL DEFAULT 0.00,
    MODIFY listing_price    DECIMAL(65, 2) NOT NULL DEFAULT 10000.00,
    MODIFY daily_trading_value DECIMAL(65, 2) NOT NULL DEFAULT 0.00,
    MODIFY total_supply     DECIMAL(65, 0) NOT NULL DEFAULT 0,
    MODIFY daily_volume     DECIMAL(65, 0) NOT NULL DEFAULT 0,
    MODIFY issued_shares    DECIMAL(65, 0) NOT NULL DEFAULT 0,
    MODIFY pre_stream_float DECIMAL(65, 0) NOT NULL DEFAULT 0;
