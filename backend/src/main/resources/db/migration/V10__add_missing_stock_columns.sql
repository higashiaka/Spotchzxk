-- =============================================================================
-- Flyway Migration V10: Add missing columns to stocks table
-- base_price and daily_volume may not exist if V9 was not fully applied
-- =============================================================================

-- Columns already added by V9 on fresh installs; only sync base_price for stale rows
UPDATE stocks SET base_price = current_price WHERE base_price = 1000 AND current_price != 1000;
