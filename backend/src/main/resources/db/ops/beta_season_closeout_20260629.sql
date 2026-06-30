-- Spotchzxk beta season closeout.
-- This is an operations script, not a Flyway migration.
--
-- Intent:
-- - Keep table schemas, including stocks.
-- - Delete beta-season stock rows and all season data tied to them.
-- - Delete DB guest users.
-- - Reset registered non-bot users to launch-ready balances.
--
-- Run the preview section first. Run the transaction only after counts look right.

-- ============================================================
-- 1. Preview counts
-- ============================================================

SELECT 'stocks' AS table_name, COUNT(*) AS rows_to_delete FROM stocks
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'user_shares', COUNT(*) FROM user_shares
UNION ALL SELECT 'dividend_logs', COUNT(*) FROM dividend_logs
UNION ALL SELECT 'user_dividend_logs', COUNT(*) FROM user_dividend_logs
UNION ALL SELECT 'stock_split_events', COUNT(*) FROM stock_split_events
UNION ALL SELECT 'stock_split_notices', COUNT(*) FROM stock_split_notices
UNION ALL SELECT 'trade_failure_logs', COUNT(*) FROM trade_failure_logs
UNION ALL SELECT 'megaphone_posts', COUNT(*) FROM megaphone_posts
UNION ALL SELECT 'cheer_logs', COUNT(*) FROM cheer_logs
UNION ALL SELECT 'user_items', COUNT(*) FROM user_items
UNION ALL SELECT 'titles', COUNT(*) FROM titles
UNION ALL SELECT 'guest_users', COUNT(*) FROM users WHERE is_guest = 1
UNION ALL SELECT 'registered_non_bot_users_to_reset', COUNT(*) FROM users WHERE is_bot = 0 AND is_guest = 0;

SELECT
    id,
    coin_balance,
    realized_profit,
    dividend_total,
    donation_total,
    nickname_change_tickets,
    stock_add_tickets
FROM users
WHERE is_bot = 0 AND is_guest = 0
ORDER BY coin_balance DESC
LIMIT 20;

-- ============================================================
-- 2. Execute closeout
-- ============================================================

START TRANSACTION;

SET SQL_SAFE_UPDATES = 0;

-- Stock-linked season records. Delete children before stocks.
DELETE FROM stock_split_events;
DELETE FROM stock_split_notices;
DELETE FROM user_dividend_logs;
DELETE FROM dividend_logs;
DELETE FROM trade_failure_logs;
DELETE FROM orders;
DELETE FROM user_shares;
DELETE FROM megaphone_posts;
DELETE FROM cheer_logs;

-- Keep the stocks table, but remove all beta registered stock rows.
-- AMM pool columns live on stocks, so this also removes beta AMM state.
DELETE FROM stocks;

-- Full season inventory/title reset. Beta rewards are granted manually later.
UPDATE users
SET selected_title_id = NULL
WHERE selected_title_id IS NOT NULL;

DELETE FROM user_items;
DELETE FROM titles;

-- Remove guest users from the app database after their dependent season data is gone.
DELETE FROM users
WHERE is_guest = 1;

-- Reset registered non-bot user assets and season stats.
UPDATE users
SET
    coin_balance = 10000000,
    realized_profit = 0,
    dividend_total = 0,
    donation_total = 0,
    nickname_change_tickets = 0,
    stock_add_tickets = 0,
    selected_title_id = NULL,
    reset_count = 0,
    last_reset_date = NULL
WHERE is_bot = 0
  AND is_guest = 0;

SET SQL_SAFE_UPDATES = 1;

COMMIT;

-- ============================================================
-- 3. Verification
-- ============================================================

SELECT 'stocks' AS table_name, COUNT(*) AS remaining_rows FROM stocks
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'user_shares', COUNT(*) FROM user_shares
UNION ALL SELECT 'dividend_logs', COUNT(*) FROM dividend_logs
UNION ALL SELECT 'user_dividend_logs', COUNT(*) FROM user_dividend_logs
UNION ALL SELECT 'stock_split_events', COUNT(*) FROM stock_split_events
UNION ALL SELECT 'stock_split_notices', COUNT(*) FROM stock_split_notices
UNION ALL SELECT 'trade_failure_logs', COUNT(*) FROM trade_failure_logs
UNION ALL SELECT 'megaphone_posts', COUNT(*) FROM megaphone_posts
UNION ALL SELECT 'cheer_logs', COUNT(*) FROM cheer_logs
UNION ALL SELECT 'user_items', COUNT(*) FROM user_items
UNION ALL SELECT 'titles', COUNT(*) FROM titles
UNION ALL SELECT 'guest_users', COUNT(*) FROM users WHERE is_guest = 1;

SELECT
    COUNT(*) AS registered_non_bot_users,
    MIN(coin_balance) AS min_balance,
    MAX(coin_balance) AS max_balance,
    SUM(realized_profit) AS realized_profit_sum,
    SUM(dividend_total) AS dividend_total_sum,
    SUM(donation_total) AS donation_total_sum
FROM users
WHERE is_bot = 0
  AND is_guest = 0;
