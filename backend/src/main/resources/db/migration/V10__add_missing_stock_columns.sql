-- =============================================================================
-- Flyway Migration V10: Add missing columns to stocks table
-- base_price and daily_volume may not exist if V9 was not fully applied
-- =============================================================================

ALTER TABLE stocks ADD COLUMN base_price   INT    NOT NULL DEFAULT 1000;
ALTER TABLE stocks ADD COLUMN daily_volume BIGINT NOT NULL DEFAULT 0;

-- Sync base_price to current_price for existing rows
UPDATE stocks SET base_price = current_price WHERE base_price = 1000 AND current_price != 1000;
