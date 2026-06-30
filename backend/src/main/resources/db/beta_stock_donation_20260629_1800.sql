SET @base_time = '2026-06-29 18:00:00';

SELECT
    CONVERT(c.stock_id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS stock_id,
    CONVERT(COALESCE(s.streamer_name, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS streamer_name,
    CONVERT(c.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS user_id,
    CONVERT(COALESCE(u.display_name, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS display_name,
    SUM(c.burned_coins) AS stock_donation_total_until_1800
FROM cheer_logs c
LEFT JOIN users u
    ON CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
     = CONVERT(c.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
LEFT JOIN stocks s
    ON CONVERT(s.channel_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
     = CONVERT(c.stock_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
WHERE c.created_at <= @base_time
  AND COALESCE(u.is_bot, 0) = 0
  AND COALESCE(u.is_guest, 0) = 0
GROUP BY c.stock_id, s.streamer_name, c.user_id, u.display_name
ORDER BY c.stock_id, stock_donation_total_until_1800 DESC;
