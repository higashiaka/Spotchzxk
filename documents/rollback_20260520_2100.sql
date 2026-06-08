-- ================================================================
-- SpotChzxk data rollback: as of 2026-05-20 21:00 KST
-- Reverses and deletes data after that point without a backup
-- Reflects V25 (megaphone_posts) and V26 (issued_shares) schema
-- ================================================================

-- 2026-05-20 21:00:00 KST = epoch ms
-- Using KST (UTC+9) as reference so the value is fixed regardless of server timezone
USE spotchzxk;

-- serverTimezone=Asia/Seoul confirmed → use KST values as-is
SET @rollback_ts_ms  = 1779278400000;        -- 2026-05-20 12:00:00 UTC (= KST 21:00)
SET @rollback_dt_kst = '2026-05-20 21:00:00';

SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- ────────────────────────────────────────────────────────────────
-- STEP 1. Reverse user balances
--   Apply completed orders that will be deleted:
--   Reverse buy  → refund the amount paid
--   Reverse sell → deduct the amount received
--   Reverse dividend → deduct dividends received
-- ────────────────────────────────────────────────────────────────
UPDATE users u
SET coin_balance = coin_balance
    + COALESCE((
        SELECT SUM(
            CASE
                WHEN type = 'buy'  THEN  executed_price * quantity   -- reverse buy  → refund
                WHEN type = 'sell' THEN -(executed_price * quantity)  -- reverse sell → deduct
                ELSE 0
            END
        )
        FROM orders
        WHERE user_id = u.id
          AND status = 'completed'
          AND user_id != '__house__'
          AND created_at > @rollback_ts_ms
    ), 0)
    - COALESCE((
        SELECT SUM(amount)
        FROM user_dividend_logs
        WHERE user_id = u.id
          AND created_at > @rollback_dt_kst
    ), 0)
WHERE u.id != '__house__';

-- Reverse dividend_total
UPDATE users u
SET dividend_total = GREATEST(0, dividend_total - COALESCE((
    SELECT SUM(amount)
    FROM user_dividend_logs
    WHERE user_id = u.id
      AND created_at > @rollback_dt_kst
), 0))
WHERE u.id != '__house__';

-- ────────────────────────────────────────────────────────────────
-- STEP 2. Reverse user share quantities
-- ────────────────────────────────────────────────────────────────
UPDATE user_shares us
SET quantity = quantity + COALESCE((
    SELECT SUM(
        CASE
            WHEN type = 'buy'  THEN -quantity   -- reverse buy  → decrease
            WHEN type = 'sell' THEN  quantity   -- reverse sell → increase
            ELSE 0
        END
    )
    FROM orders
    WHERE user_id  = us.user_id
      AND streamer_id = us.channel_id
      AND status   = 'completed'
      AND user_id  != '__house__'
      AND created_at > @rollback_ts_ms
), 0);

-- Remove rows where quantity dropped to 0 or below
DELETE FROM user_shares WHERE quantity <= 0;

-- ────────────────────────────────────────────────────────────────
-- STEP 3. Restore stock prices — last executed price just before the rollback point
-- ────────────────────────────────────────────────────────────────
UPDATE stocks s
JOIN (
    SELECT o.streamer_id, o.executed_price
    FROM orders o
    INNER JOIN (
        SELECT streamer_id, MAX(created_at) AS last_ts
        FROM orders
        WHERE status = 'completed'
          AND created_at <= @rollback_ts_ms
        GROUP BY streamer_id
    ) latest ON o.streamer_id = latest.streamer_id
            AND o.created_at  = latest.last_ts
    WHERE o.status = 'completed'
) last_trade ON s.channel_id = last_trade.streamer_id
SET s.current_price = last_trade.executed_price;

-- ────────────────────────────────────────────────────────────────
-- STEP 4. Delete data after the rollback point
-- ────────────────────────────────────────────────────────────────
DELETE FROM orders         WHERE created_at > @rollback_ts_ms;
DELETE FROM dividend_logs  WHERE created_at > @rollback_dt_kst;
DELETE FROM user_dividend_logs WHERE created_at > @rollback_dt_kst;

-- megaphone_posts: table was created on 2026-05-21 → truncate entirely
TRUNCATE TABLE megaphone_posts;

-- ────────────────────────────────────────────────────────────────
-- STEP 5. Recalculate issued_shares (new column in V26)
-- ────────────────────────────────────────────────────────────────
UPDATE stocks s
SET issued_shares = (
    SELECT COALESCE(SUM(us.quantity), 0)
    FROM user_shares us
    WHERE us.channel_id = s.channel_id
      AND us.user_id != '__house__'
);

-- ────────────────────────────────────────────────────────────────
-- STEP 6. Reset daily_volume (will be repopulated by new trades anyway)
-- ────────────────────────────────────────────────────────────────
UPDATE stocks SET daily_volume = 0;

-- ────────────────────────────────────────────────────────────────
-- STEP 7. Reset live state (dividend pool, live start time, etc.)
-- ────────────────────────────────────────────────────────────────
UPDATE stocks
SET dividend_pool                = 0,
    dividend_accumulation_count  = 0,
    live_started_at              = NULL;

SET FOREIGN_KEY_CHECKS = 1;

-- COMMIT if everything looks correct, otherwise ROLLBACK;
COMMIT;

-- ================================================================
-- Verification queries to run after execution
-- ================================================================
-- SELECT channel_id, streamer_name, current_price, issued_shares FROM stocks;
-- SELECT u.id, u.coin_balance FROM users u WHERE u.id != '__house__' LIMIT 20;
-- SELECT COUNT(*) FROM orders;
