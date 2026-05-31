-- Leaderboard: ORDER BY realized_profit DESC LIMIT 50 WHERE is_bot=0 AND is_guest=0
SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'users'
      AND index_name = 'idx_users_ranking_profit');
SET @sql = IF(@idx_exists = 0,
    'CREATE INDEX idx_users_ranking_profit ON users (is_bot, is_guest, realized_profit)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Leaderboard: ORDER BY dividend_total DESC LIMIT 50 WHERE is_bot=0 AND is_guest=0
SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'users'
      AND index_name = 'idx_users_ranking_dividend');
SET @sql = IF(@idx_exists = 0,
    'CREATE INDEX idx_users_ranking_dividend ON users (is_bot, is_guest, dividend_total)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- user_dividend_logs: per-user history with date ordering
-- covers findTop50ByUserIdOrderByCreatedAtDesc without post-sort
SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'user_dividend_logs'
      AND index_name = 'idx_udl_user_created');
SET @sql = IF(@idx_exists = 0,
    'CREATE INDEX idx_udl_user_created ON user_dividend_logs (user_id, created_at)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orders: limit order lookup by streamer + status (findByStreamerIdAndStatusOrderByCreatedAtAsc)
SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'orders'
      AND index_name = 'idx_orders_streamer_status');
SET @sql = IF(@idx_exists = 0,
    'CREATE INDEX idx_orders_streamer_status ON orders (streamer_id, status, created_at)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
