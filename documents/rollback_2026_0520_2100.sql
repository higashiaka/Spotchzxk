-- ============================================================
-- Full rollback — as of 2026-05-20 21:00 KST
-- Scope: stock prices, total supply, user holdings, user balances, order deletion
-- After running: server restart required
-- ============================================================

SET @cutoff = 1779278400000; -- 2026-05-20 21:00 KST (= UTC 12:00)

START TRANSACTION;

-- ── 1. Restore stock prices (last executed price before 21:00) ───────────────
UPDATE stocks s
SET s.current_price = COALESCE(
    (SELECT CAST(o.executed_price AS UNSIGNED)
     FROM orders o
     WHERE o.streamer_id = s.channel_id
       AND o.created_at <= @cutoff
       AND o.status = 'completed'
     ORDER BY o.created_at DESC
     LIMIT 1),
    s.base_price  -- fall back to base_price if no trade history exists
);

-- ── 2. Restore total supply ──────────────────────────────────────────────────
UPDATE stocks s
SET s.total_supply = GREATEST(0, COALESCE(
    (SELECT SUM(CASE WHEN o.type = 'buy' THEN o.quantity ELSE -o.quantity END)
     FROM orders o
     WHERE o.streamer_id = s.channel_id
       AND o.created_at <= @cutoff
       AND o.status = 'completed'),
    0
));

-- ── 3. Restore user holdings ─────────────────────────────────────────────────
DELETE FROM user_shares;

INSERT INTO user_shares (user_id, channel_id, quantity, avg_price)
SELECT
    o.user_id,
    o.streamer_id,
    SUM(CASE WHEN o.type = 'buy' THEN o.quantity ELSE -o.quantity END) AS quantity,
    ROUND(
        SUM(CASE WHEN o.type = 'buy' THEN o.executed_price * o.quantity ELSE 0 END) /
        NULLIF(SUM(CASE WHEN o.type = 'buy' THEN o.quantity ELSE 0 END), 0),
    2) AS avg_price
FROM orders o
WHERE o.created_at <= @cutoff
  AND o.status = 'completed'
GROUP BY o.user_id, o.streamer_id
HAVING quantity > 0;

-- ── 4. Restore user balances (initial 10,000,000 + trade P&L) ────────────────
UPDATE users u
SET u.coin_balance = GREATEST(0, 10000000 + COALESCE(
    (SELECT SUM(
        CASE
            WHEN o.type = 'buy'  THEN -(o.executed_price * o.quantity * 1.01)
            WHEN o.type = 'sell' THEN  (o.executed_price * o.quantity * 0.99)
        END
     )
     FROM orders o
     WHERE o.user_id = u.id
       AND o.created_at <= @cutoff
       AND o.status = 'completed'),
    0
));

-- ── 5. Delete orders placed after 21:00 ──────────────────────────────────────
DELETE FROM orders WHERE created_at > @cutoff;

-- ── Verify results ───────────────────────────────────────────────────────────
SELECT channel_id, streamer_name, current_price, total_supply
FROM stocks
ORDER BY current_price DESC
LIMIT 20;

SELECT COUNT(*) AS remaining_orders FROM orders;

COMMIT;
-- ROLLBACK;
