-- Manual daily reset triggered on 2026-06-14: midnight cron was missed due to
-- deployment timing, and daily_trading_value/daily_volume had accumulated values
-- (some capped at Long.MAX_VALUE from the old saturatingAdd, some unbounded after
-- the BigDecimal refactor). Reset all daily fields to a clean state now.

-- Reset stock daily fields (simulate applyDailyReset)
UPDATE stocks
SET base_price          = current_price,
    daily_trading_value = 0,
    daily_volume        = 0;

-- Reset user ranking stats (simulate resetAllRankingStats)
UPDATE users
SET realized_profit = 0,
    dividend_total  = 0,
    donation_total  = 0
WHERE is_bot = 0
  AND is_guest = 0;
