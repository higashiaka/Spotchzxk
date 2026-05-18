-- =============================================================================
-- Flyway Migration V9: Add daily volume and base price columns to stocks table
-- =============================================================================

ALTER TABLE stocks ADD COLUMN daily_volume BIGINT NOT NULL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN base_price INT NOT NULL DEFAULT 1000;

-- Initialize base_price to current_price for all existing stocks
UPDATE stocks SET base_price = current_price;
