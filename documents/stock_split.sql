-- ============================================================
-- Stock split script — applies 10:1 split only to stocks with current_price > 200,000 (idempotent)
-- After running: server restart required (to clear in-memory cache)
-- ============================================================

START TRANSACTION;

-- Check target stocks (verify before committing)
SELECT channel_id, streamer_name, current_price, base_price, total_supply
FROM stocks
WHERE current_price > 200000
ORDER BY current_price DESC;

-- 1. Capture split-target channel_ids before updating stocks (prevents condition pollution)
CREATE TEMPORARY TABLE IF NOT EXISTS _split_targets AS
    SELECT channel_id FROM stocks WHERE current_price > 200000;

-- 2. stocks: price ÷10, total_supply ×10
UPDATE stocks SET
    current_price = GREATEST(1, FLOOR(current_price / 10)),
    base_price    = GREATEST(1, FLOOR(base_price    / 10)),
    total_supply  = total_supply * 10
WHERE channel_id IN (SELECT channel_id FROM _split_targets);

-- 3. user_shares: multiply quantity ×10 and divide avg_price ÷10 only for holders of split stocks
UPDATE user_shares SET
    quantity  = quantity * 10,
    avg_price = ROUND(avg_price / 10, 2)
WHERE channel_id IN (SELECT channel_id FROM _split_targets);

DROP TEMPORARY TABLE _split_targets;

-- Verify results
SELECT channel_id, streamer_name, current_price, base_price, total_supply
FROM stocks
ORDER BY current_price DESC;

COMMIT;
-- ROLLBACK; -- Use this instead of COMMIT if the results look wrong
