-- =============================================================================
-- Flyway Migration V11: Add listed_at column to stocks
-- Candles before this timestamp will not be drawn on the chart
-- =============================================================================

ALTER TABLE stocks ADD COLUMN listed_at DATETIME NOT NULL DEFAULT NOW();

-- Existing stocks: treat created_at as listing date (fallback to NOW if null)
UPDATE stocks SET listed_at = COALESCE(created_at, NOW()) WHERE listed_at = NOW();
