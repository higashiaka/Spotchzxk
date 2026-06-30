-- ============================================================
-- 베타 보상 칭호 지급 스크립트
-- 기준 시각: 2026-06-29 18:00:00
-- ============================================================

SET @base_time  = '2026-06-29 18:00:00';
SET @granted_at = NOW();

-- ============================================================
-- 임시 테이블 1: 유저별 스냅샷 (티어 / 실현손익 / 배당)
-- ============================================================
DROP TEMPORARY TABLE IF EXISTS tmp_beta_snapshot;
CREATE TEMPORARY TABLE tmp_beta_snapshot AS
WITH
completed_orders AS (
    SELECT user_id, streamer_id, type, quantity, executed_price, executed_at
    FROM orders
    WHERE status = 'completed'
      AND executed_at IS NOT NULL
      AND executed_at <= UNIX_TIMESTAMP(@base_time) * 1000
),
share_positions AS (
    SELECT user_id, streamer_id,
        SUM(CASE WHEN type = 'buy'  THEN  quantity
                 WHEN type = 'sell' THEN -quantity
                 ELSE 0 END) AS qty
    FROM completed_orders
    GROUP BY user_id, streamer_id
),
orders_after AS (
    SELECT user_id,
        SUM(CASE WHEN type = 'buy'  THEN -quantity * executed_price
                 WHEN type = 'sell' THEN  quantity * executed_price
                 ELSE 0 END) AS coin_delta
    FROM orders
    WHERE status = 'completed'
      AND executed_at IS NOT NULL
      AND executed_at > UNIX_TIMESTAMP(@base_time) * 1000
    GROUP BY user_id
),
assets AS (
    SELECT
        u.id AS user_id,
        COALESCE(u.coin_balance, 0)
        - COALESCE(oa.coin_delta, 0)
        + COALESCE(SUM(
            CASE WHEN sp.qty > 0 THEN sp.qty * COALESCE(s.current_price, 0) ELSE 0 END
          ), 0) AS total_assets
    FROM users u
    LEFT JOIN share_positions sp
        ON CONVERT(sp.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         = CONVERT(u.id      USING utf8mb4) COLLATE utf8mb4_unicode_ci
    LEFT JOIN stocks s
        ON CONVERT(s.channel_id  USING utf8mb4) COLLATE utf8mb4_unicode_ci
         = CONVERT(sp.streamer_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
    LEFT JOIN orders_after oa
        ON CONVERT(oa.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         = CONVERT(u.id       USING utf8mb4) COLLATE utf8mb4_unicode_ci
    WHERE u.is_bot = 0 AND u.is_guest = 0
    GROUP BY u.id, u.coin_balance, oa.coin_delta
),
ranked AS (
    SELECT user_id, total_assets,
        RANK()  OVER (ORDER BY total_assets DESC) AS rnk,
        COUNT() OVER ()                            AS total_cnt
    FROM assets
),
dividends AS (
    SELECT user_id, SUM(amount) AS div_total
    FROM user_dividend_logs
    WHERE created_at <= @base_time
    GROUP BY user_id
),
sold_after AS (
    SELECT user_id,
        SUM(CASE WHEN type = 'sell' THEN quantity * executed_price ELSE 0 END) AS sell_proceeds
    FROM orders
    WHERE status = 'completed'
      AND executed_at IS NOT NULL
      AND executed_at > UNIX_TIMESTAMP(@base_time) * 1000
    GROUP BY user_id
)
SELECT
    CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS user_id,
    COALESCE(u.realized_profit, 0) - COALESCE(sa.sell_proceeds, 0) AS realized_profit,
    COALESCE(d.div_total, 0)                                         AS dividend_total,
    CASE
        WHEN r.total_cnt = 0 THEN 'BETA_IRON'
        WHEN ROUND(((r.total_cnt - r.rnk) / r.total_cnt) * 100, 4) >= 99 THEN 'BETA_CHALLENGER'
        WHEN ROUND(((r.total_cnt - r.rnk) / r.total_cnt) * 100, 4) >= 97 THEN 'BETA_GRANDMASTER'
        WHEN ROUND(((r.total_cnt - r.rnk) / r.total_cnt) * 100, 4) >= 94 THEN 'BETA_MASTER'
        WHEN ROUND(((r.total_cnt - r.rnk) / r.total_cnt) * 100, 4) >= 88 THEN 'BETA_DIAMOND'
        WHEN ROUND(((r.total_cnt - r.rnk) / r.total_cnt) * 100, 4) >= 75 THEN 'BETA_EMERALD'
        WHEN ROUND(((r.total_cnt - r.rnk) / r.total_cnt) * 100, 4) >= 55 THEN 'BETA_PLATINUM'
        WHEN ROUND(((r.total_cnt - r.rnk) / r.total_cnt) * 100, 4) >= 35 THEN 'BETA_GOLD'
        WHEN ROUND(((r.total_cnt - r.rnk) / r.total_cnt) * 100, 4) >= 18 THEN 'BETA_SILVER'
        WHEN ROUND(((r.total_cnt - r.rnk) / r.total_cnt) * 100, 4) >=  7 THEN 'BETA_BRONZE'
        ELSE 'BETA_IRON'
    END AS tier_type
FROM users u
JOIN ranked r
    ON CONVERT(r.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
     = CONVERT(u.id      USING utf8mb4) COLLATE utf8mb4_unicode_ci
LEFT JOIN dividends d
    ON CONVERT(d.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
     = CONVERT(u.id      USING utf8mb4) COLLATE utf8mb4_unicode_ci
LEFT JOIN sold_after sa
    ON CONVERT(sa.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
     = CONVERT(u.id       USING utf8mb4) COLLATE utf8mb4_unicode_ci
WHERE u.is_bot = 0 AND u.is_guest = 0;

-- ============================================================
-- 임시 테이블 2: 실현 손익 랭킹
-- ============================================================
DROP TEMPORARY TABLE IF EXISTS tmp_profit_ranked;
CREATE TEMPORARY TABLE tmp_profit_ranked AS
SELECT user_id, realized_profit,
    RANK() OVER (ORDER BY realized_profit DESC) AS profit_rank
FROM tmp_beta_snapshot;

-- ============================================================
-- 임시 테이블 3: 배당 수익 랭킹
-- ============================================================
DROP TEMPORARY TABLE IF EXISTS tmp_dividend_ranked;
CREATE TEMPORARY TABLE tmp_dividend_ranked AS
SELECT user_id, dividend_total,
    RANK() OVER (ORDER BY dividend_total DESC) AS div_rank
FROM tmp_beta_snapshot;

-- ============================================================
-- 임시 테이블 4: 종목별 기부량 랭킹
-- ============================================================
DROP TEMPORARY TABLE IF EXISTS tmp_cheer_ranked;
CREATE TEMPORARY TABLE tmp_cheer_ranked AS
SELECT stock_id, user_id, total_burned,
    RANK() OVER (PARTITION BY stock_id ORDER BY total_burned DESC) AS cheer_rank
FROM (
    SELECT
        CONVERT(c.stock_id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS stock_id,
        CONVERT(c.user_id  USING utf8mb4) COLLATE utf8mb4_unicode_ci AS user_id,
        SUM(c.burned_coins) AS total_burned
    FROM cheer_logs c
    LEFT JOIN users u
        ON CONVERT(u.id       USING utf8mb4) COLLATE utf8mb4_unicode_ci
         = CONVERT(c.user_id  USING utf8mb4) COLLATE utf8mb4_unicode_ci
    WHERE c.created_at <= @base_time
      AND COALESCE(u.is_bot,   0) = 0
      AND COALESCE(u.is_guest, 0) = 0
    GROUP BY c.stock_id, c.user_id
) grouped;

-- ============================================================
-- [1] 티어 칭호 (전원, 글로벌)
--   BETA_IRON / BETA_BRONZE / BETA_SILVER / BETA_GOLD /
--   BETA_PLATINUM / BETA_EMERALD / BETA_DIAMOND /
--   BETA_MASTER / BETA_GRANDMASTER / BETA_CHALLENGER
-- ============================================================
INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, NULL, tier_type, @granted_at
FROM tmp_beta_snapshot;

-- ============================================================
-- [2] 실현 손익 칭호 (글로벌, 누적 지급)
--   주식 고수(50) > 숙련 트레이더(30) > 베테랑 트레이더(10)
--   > 엘리트 트레이더(5) > 전설적 트레이더(3) > 최고의 트레이더(1)
-- ============================================================
INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, NULL, 'PROFIT_TOP50', @granted_at
FROM tmp_profit_ranked WHERE profit_rank <= 50;

INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, NULL, 'PROFIT_TOP30', @granted_at
FROM tmp_profit_ranked WHERE profit_rank <= 30;

INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, NULL, 'PROFIT_TOP10', @granted_at
FROM tmp_profit_ranked WHERE profit_rank <= 10;

INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, NULL, 'PROFIT_TOP5', @granted_at
FROM tmp_profit_ranked WHERE profit_rank <= 5;

INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, NULL, 'PROFIT_TOP3', @granted_at
FROM tmp_profit_ranked WHERE profit_rank <= 3;

INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, NULL, 'PROFIT_TOP1', @granted_at
FROM tmp_profit_ranked WHERE profit_rank = 1;

-- ============================================================
-- [3] 배당 수익 칭호 (글로벌, 누적 지급)
--   배당 고수(50) > 숙련 주주(30) > 베테랑 주주(10)
--   > 엘리트 주주(5) > 전설적 주주(3) > 배당의 신(1)
-- ============================================================
INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, NULL, 'DIVIDEND_TOP50', @granted_at
FROM tmp_dividend_ranked WHERE div_rank <= 50;

INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, NULL, 'DIVIDEND_TOP30', @granted_at
FROM tmp_dividend_ranked WHERE div_rank <= 30;

INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, NULL, 'DIVIDEND_TOP10', @granted_at
FROM tmp_dividend_ranked WHERE div_rank <= 10;

INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, NULL, 'DIVIDEND_TOP5', @granted_at
FROM tmp_dividend_ranked WHERE div_rank <= 5;

INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, NULL, 'DIVIDEND_TOP3', @granted_at
FROM tmp_dividend_ranked WHERE div_rank <= 3;

INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, NULL, 'DIVIDEND_TOP1', @granted_at
FROM tmp_dividend_ranked WHERE div_rank = 1;

-- ============================================================
-- [4] 종목별 기부 칭호 (종목 stock_id 연결)
--   1등 → CHEER_VVIP  /  2~10등 → CHEER_VIP
-- ============================================================
INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, stock_id, 'CHEER_VVIP', @granted_at
FROM tmp_cheer_ranked WHERE cheer_rank = 1;

INSERT IGNORE INTO titles (user_id, stock_id, title_type, granted_at)
SELECT user_id, stock_id, 'CHEER_VIP', @granted_at
FROM tmp_cheer_ranked WHERE cheer_rank BETWEEN 2 AND 10;

-- ============================================================
-- 임시 테이블 정리
-- ============================================================
DROP TEMPORARY TABLE IF EXISTS tmp_beta_snapshot;
DROP TEMPORARY TABLE IF EXISTS tmp_profit_ranked;
DROP TEMPORARY TABLE IF EXISTS tmp_dividend_ranked;
DROP TEMPORARY TABLE IF EXISTS tmp_cheer_ranked;
