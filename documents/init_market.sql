-- =============================================================================
-- Spotchzxk database initialization and default setup queries
-- File location: documents/init_market.sql
-- =============================================================================
-- [WARNING] Always back up existing data before running this script.
-- These queries are written to match the current JPA Entity structure and Flyway Migration (V5) schema.
-- =============================================================================

USE spotchzxk;

-- Disable safe update mode and temporarily disable foreign key checks (for initialization)
SET SQL_SAFE_UPDATES = 0;
SET FOREIGN_KEY_CHECKS = 0;


-- =============================================================================
-- Method 1. Reset data only while keeping registered users and streamer list (recommended)
-- =============================================================================
-- Keeps registered user accounts (users) and streamer list (stocks) intact,
-- while clearing holdings (user_shares) and dividend history (dividend_logs)
-- and resetting balances and prices to their initial values.
-- =============================================================================

-- 1. Delete all holdings, dividend logs, and orders (including Auto_Increment reset)
TRUNCATE TABLE user_shares;
TRUNCATE TABLE dividend_logs;
TRUNCATE TABLE orders;

-- 2. Reset all registered users balances to the initial amount of 10,000,000
-- (based on INITIAL_BALANCE = 10,000,000 in PortfolioService.java)
UPDATE users
SET coin_balance = 10000000.00;

-- 3. Process all streamer stocks
-- [Option A] Keep the existing stock list and reset only price and supply to initial values
UPDATE stocks
SET current_price = 1000,
    total_supply = 0,
    daily_volume = 0,
    base_price = 1000,
    is_live = FALSE;

-- [Option B] Completely delete all registered stocks to start with an empty list
-- (If you want to delete the stock list too, uncomment the query below instead of Option A)
-- TRUNCATE TABLE stocks;

-- 4. Reset guest login device mapping data (uncomment and run if needed)
-- TRUNCATE TABLE device_mappings;


-- Restore foreign key checks and safe update settings
SET FOREIGN_KEY_CHECKS = 1;
SET SQL_SAFE_UPDATES = 1;

-- Query to verify the initialization state
SELECT 'users (유저)' AS table_name, COUNT(*) AS count, MIN(coin_balance) AS min_val, MAX(coin_balance) AS max_val FROM users
UNION ALL
SELECT 'stocks (주식)', COUNT(*), MIN(current_price), MAX(current_price) FROM stocks
UNION ALL
SELECT 'user_shares (보유량)', COUNT(*), NULL, NULL FROM user_shares
UNION ALL
SELECT 'dividend_logs (배당로그)', COUNT(*), NULL, NULL FROM dividend_logs;


-- =============================================================================
-- Method 2. Drop all tables and recreate schema from scratch (full reset)
-- =============================================================================
-- Use when the database structure is corrupted or you want to start clean with new fields.
-- To run, fully uncomment the block below (/* ... */) and execute.
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Drop all existing tables (in reverse dependency order)
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS dividend_logs;
DROP TABLE IF EXISTS user_shares;
DROP TABLE IF EXISTS stocks;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS device_mappings;

-- 1. Create users table
CREATE TABLE users (
    id VARCHAR(128) NOT NULL,
    coin_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Create streamer stocks table (stocks)
CREATE TABLE stocks (
    channel_id VARCHAR(50) NOT NULL,
    streamer_name VARCHAR(100) NOT NULL,
    profile_image_url TEXT,
    follower_count INT DEFAULT 0,
    base_broadcast_hours INT DEFAULT 0,
    total_supply BIGINT NOT NULL DEFAULT 0,
    daily_volume BIGINT NOT NULL DEFAULT 0,
    base_price INT NOT NULL DEFAULT 1000,
    current_price INT DEFAULT 1000,
    is_live BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT NOW(),
    PRIMARY KEY (channel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create user holdings mapping table (user_shares)
CREATE TABLE user_shares (
    share_id BIGINT AUTO_INCREMENT NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    channel_id VARCHAR(50) NOT NULL,
    quantity BIGINT NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
    PRIMARY KEY (share_id),
    CONSTRAINT fk_us_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_us_stock FOREIGN KEY (channel_id) REFERENCES stocks(channel_id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_stock (user_id, channel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create dividend payout log table (dividend_logs)
CREATE TABLE dividend_logs (
    log_id BIGINT AUTO_INCREMENT NOT NULL,
    channel_id VARCHAR(50) NOT NULL,
    total_dividend_pool INT NOT NULL,
    payout_reason VARCHAR(255),
    created_at DATETIME DEFAULT NOW(),
    PRIMARY KEY (log_id),
    CONSTRAINT fk_dl_stock FOREIGN KEY (channel_id) REFERENCES stocks(channel_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Create order history table (orders)
CREATE TABLE orders (
    id              VARCHAR(36)   NOT NULL,
    user_id         VARCHAR(128)  NOT NULL,
    streamer_id     VARCHAR(50)   NOT NULL,
    type            VARCHAR(10)   NOT NULL,
    quantity        INT           NOT NULL,
    estimated_price DECIMAL(12,2) NOT NULL,
    executed_price  DECIMAL(12,2),
    status          VARCHAR(20)   NOT NULL DEFAULT 'completed',
    created_at      BIGINT        NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_orders_stock FOREIGN KEY (streamer_id) REFERENCES stocks(channel_id) ON DELETE CASCADE,
    INDEX idx_orders_user_id (user_id),
    INDEX idx_orders_streamer_id (streamer_id),
    INDEX idx_orders_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Create guest device mapping table (device_mappings)
CREATE TABLE device_mappings (
    fingerprint VARCHAR(128) NOT NULL,
    uid         VARCHAR(128) NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (fingerprint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
