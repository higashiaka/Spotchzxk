SET @base_time = '2026-06-29 18:00:00';

WITH
completed_orders_until_base AS (
    SELECT user_id, streamer_id, type, quantity, executed_price, executed_at
    FROM orders
    WHERE status = 'completed'
      AND executed_at IS NOT NULL
      AND executed_at <= UNIX_TIMESTAMP(@base_time) * 1000
),
share_position_until_base AS (
    SELECT
        user_id,
        streamer_id,
        SUM(CASE WHEN type = 'buy' THEN quantity WHEN type = 'sell' THEN -quantity ELSE 0 END) AS quantity_until_1800
    FROM completed_orders_until_base
    GROUP BY user_id, streamer_id
),
orders_after_1800 AS (
    SELECT
        user_id,
        SUM(CASE WHEN type = 'buy' THEN -1 * quantity * executed_price
                 WHEN type = 'sell' THEN quantity * executed_price ELSE 0 END) AS net_coin_delta_after_1800
    FROM orders
    WHERE status = 'completed'
      AND executed_at IS NOT NULL
      AND executed_at > UNIX_TIMESTAMP(@base_time) * 1000
    GROUP BY user_id
),
user_assets_until_base AS (
    SELECT
        u.id AS user_id,
        COALESCE(u.coin_balance, 0)
        - COALESCE(o.net_coin_delta_after_1800, 0)
        + COALESCE(SUM(
            CASE
                WHEN spu.quantity_until_1800 > 0
                THEN spu.quantity_until_1800 * COALESCE(s.current_price, 0)
                ELSE 0
            END
        ), 0) AS estimated_total_assets_until_1800
    FROM users u
    LEFT JOIN share_position_until_base spu
        ON CONVERT(spu.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         = CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
    LEFT JOIN stocks s
        ON CONVERT(s.channel_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         = CONVERT(spu.streamer_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
    LEFT JOIN orders_after_1800 o
        ON CONVERT(o.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         = CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
    WHERE u.is_bot = 0
      AND u.is_guest = 0
    GROUP BY u.id, u.coin_balance, o.net_coin_delta_after_1800
),
ranked_users AS (
    SELECT
        ua.*,
        RANK() OVER (ORDER BY ua.estimated_total_assets_until_1800 DESC) AS league_rank,
        COUNT(*) OVER () AS league_total
    FROM user_assets_until_base ua
),
dividend_until_base AS (
    SELECT user_id, SUM(amount) AS dividend_total_until_1800
    FROM user_dividend_logs
    WHERE created_at <= @base_time
    GROUP BY user_id
),
donation_until_base AS (
    SELECT user_id, SUM(burned_coins) AS donation_total_until_1800
    FROM cheer_logs
    WHERE created_at <= @base_time
    GROUP BY user_id
),
realized_after_base_estimate AS (
    SELECT
        user_id,
        SUM(CASE WHEN type = 'sell' THEN quantity * executed_price ELSE 0 END) AS sell_proceeds_after_1800
    FROM orders
    WHERE status = 'completed'
      AND executed_at IS NOT NULL
      AND executed_at > UNIX_TIMESTAMP(@base_time) * 1000
    GROUP BY user_id
)
SELECT
    CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS user_id,
    CONVERT(COALESCE(u.display_name, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS display_name,
    CONVERT(COALESCE(u.profile_image_url, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS profile_image_url,
    COALESCE(d.dividend_total_until_1800, 0) AS dividend_total_until_1800,
    COALESCE(u.realized_profit, 0) - COALESCE(ra.sell_proceeds_after_1800, 0) AS estimated_realized_profit_until_1800,
    COALESCE(du.donation_total_until_1800, 0) AS donation_total_until_1800,
    r.estimated_total_assets_until_1800,
    r.league_rank,
    r.league_total,
    ROUND(((r.league_total - r.league_rank) / r.league_total) * 100, 4) AS tier_percentile,
    CASE
        WHEN r.league_total = 0 THEN '아이언'
        WHEN ((r.league_total - r.league_rank) / r.league_total) * 100 >= 99 THEN '챌린저'
        WHEN ((r.league_total - r.league_rank) / r.league_total) * 100 >= 97 THEN '그랜드마스터'
        WHEN ((r.league_total - r.league_rank) / r.league_total) * 100 >= 94 THEN '마스터'
        WHEN ((r.league_total - r.league_rank) / r.league_total) * 100 >= 88 THEN '다이아몬드'
        WHEN ((r.league_total - r.league_rank) / r.league_total) * 100 >= 75 THEN '에메랄드'
        WHEN ((r.league_total - r.league_rank) / r.league_total) * 100 >= 55 THEN '플래티넘'
        WHEN ((r.league_total - r.league_rank) / r.league_total) * 100 >= 35 THEN '골드'
        WHEN ((r.league_total - r.league_rank) / r.league_total) * 100 >= 18 THEN '실버'
        WHEN ((r.league_total - r.league_rank) / r.league_total) * 100 >= 7 THEN '브론즈'
        ELSE '아이언'
    END AS user_tier
FROM users u
JOIN ranked_users r
    ON CONVERT(r.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
     = CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
LEFT JOIN dividend_until_base d
    ON CONVERT(d.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
     = CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
LEFT JOIN donation_until_base du
    ON CONVERT(du.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
     = CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
LEFT JOIN realized_after_base_estimate ra
    ON CONVERT(ra.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
     = CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
WHERE u.is_bot = 0
  AND u.is_guest = 0
ORDER BY r.league_rank ASC;
