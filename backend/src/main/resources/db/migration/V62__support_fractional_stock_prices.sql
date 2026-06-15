ALTER TABLE stocks
    MODIFY current_price       DECIMAL(65, 6) NOT NULL DEFAULT 0.000000,
    MODIFY base_price          DECIMAL(65, 6) NOT NULL DEFAULT 0.000000,
    MODIFY listing_price       DECIMAL(65, 6) NOT NULL DEFAULT 10000.000000,
    MODIFY daily_trading_value DECIMAL(65, 6) NOT NULL DEFAULT 0.000000;

ALTER TABLE orders
    MODIFY estimated_price DECIMAL(65, 6) NOT NULL,
    MODIFY executed_price  DECIMAL(65, 6) NULL,
    MODIFY limit_price     DECIMAL(65, 6) NULL;

ALTER TABLE user_shares
    MODIFY avg_price DECIMAL(65, 6) NULL;

ALTER TABLE users
    MODIFY realized_profit DECIMAL(65, 6) NOT NULL DEFAULT 0.000000;

-- Restore prices that were rounded down to 0.00 by the previous 2-decimal schema.
UPDATE stocks
SET current_price = ROUND(coin_reserve / share_reserve, 6)
WHERE coin_reserve > 0
  AND share_reserve > 0;

UPDATE stocks
SET base_price = current_price
WHERE base_price = 0
  AND current_price > 0;
