-- =============================================================================
-- Spotchzxk 데이터베이스 초기화 및 기본 세팅 쿼리
-- 파일 위치: documents/init_market.sql
-- =============================================================================
-- [주의] 실행 전에 만약의 사태를 대비해 기존 데이터를 반드시 백업하세요.
-- 이 쿼리문은 현재 최신 JPA Entity 구조 및 Flyway Migration(V5) 스키마에 맞춰 작성되었습니다.
-- =============================================================================

USE spotchzxk;

-- 안전 업데이트 비활성화 및 외래 키 제약 조건 일시 해제 (초기화 작업용)
SET SQL_SAFE_UPDATES = 0;
SET FOREIGN_KEY_CHECKS = 0;


-- =============================================================================
-- 방법 1. 기존 가입 유저 및 등록 스트리머 정보를 유지하면서 데이터만 리셋 (추천)
-- =============================================================================
-- 이 방식은 가입된 유저 계정(users)과 등록된 스트리머 목록(stocks)은 유지한 채,
-- 보유 주식(user_shares) 및 배당 이력(dividend_logs)을 지우고 잔고와 시세를 초기값으로 되돌립니다.
-- =============================================================================

-- 1. 보유 주식 내역, 배당 지급 로그, 주문 내역 전체 삭제 (Auto_Increment 리셋 포함)
TRUNCATE TABLE user_shares;
TRUNCATE TABLE dividend_logs;
TRUNCATE TABLE orders;

-- 2. 모든 가입 유저의 잔고를 초기 금액인 10,000,000 Coin으로 초기화
-- (PortfolioService.java의 INITIAL_BALANCE = 10,000,000 기준)
UPDATE users
SET coin_balance = 10000000.00;

-- 3. 모든 스트리머 종목(stocks) 처리
-- [선택 A] 기존 등록된 종목 리스트(stocks)를 유지하면서 가격 및 발행량만 초기값으로 리셋
UPDATE stocks
SET current_price = 1000,
    total_supply = 0,
    daily_volume = 0,
    base_price = 1000,
    is_live = FALSE;

-- [선택 B] 등록된 모든 종목 리스트(stocks)를 완전히 삭제하여 빈 상태로 만들기
-- (종목 리스트도 모두 삭제하고 싶은 경우, 위의 [선택 A] 대신 아래 쿼리의 주석을 해제하여 실행하세요)
-- TRUNCATE TABLE stocks;

-- 4. 게스트 로그인 기기 매핑 정보 초기화 (필요시 아래 주석을 해제하고 실행하세요)
-- TRUNCATE TABLE device_mappings;


-- 외래 키 제약 조건 및 안전 업데이트 설정 원복
SET FOREIGN_KEY_CHECKS = 1;
SET SQL_SAFE_UPDATES = 1;

-- 초기화 상태 확인을 위한 조회
SELECT 'users (유저)' AS table_name, COUNT(*) AS count, MIN(coin_balance) AS min_val, MAX(coin_balance) AS max_val FROM users
UNION ALL
SELECT 'stocks (주식)', COUNT(*), MIN(current_price), MAX(current_price) FROM stocks
UNION ALL
SELECT 'user_shares (보유량)', COUNT(*), NULL, NULL FROM user_shares
UNION ALL
SELECT 'dividend_logs (배당로그)', COUNT(*), NULL, NULL FROM dividend_logs;


-- =============================================================================
-- 방법 2. 테이블 완전 삭제(Drop) 후 스키마 처음부터 다시 생성 (완전 초기화용)
-- =============================================================================
-- 데이터베이스 구조가 꼬였거나 완전히 깨끗한 상태에서 새 필드로 시작하고 싶을 때 사용합니다.
-- 실행하려면 아래 주석(/* ... */)을 완전히 해제하고 쿼리를 실행하세요.
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 기존 테이블 전체 Drop (연관 관계 역순으로 삭제)
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS dividend_logs;
DROP TABLE IF EXISTS user_shares;
DROP TABLE IF EXISTS stocks;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS device_mappings;

-- 1. 유저 테이블 생성 (users)
CREATE TABLE users (
    id VARCHAR(128) NOT NULL,
    coin_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 스트리머 주식 테이블 생성 (stocks)
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

-- 3. 유저 보유 주식 매핑 테이블 생성 (user_shares)
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

-- 4. 배당금 지급 로그 테이블 생성 (dividend_logs)
CREATE TABLE dividend_logs (
    log_id BIGINT AUTO_INCREMENT NOT NULL,
    channel_id VARCHAR(50) NOT NULL,
    total_dividend_pool INT NOT NULL,
    payout_reason VARCHAR(255),
    created_at DATETIME DEFAULT NOW(),
    PRIMARY KEY (log_id),
    CONSTRAINT fk_dl_stock FOREIGN KEY (channel_id) REFERENCES stocks(channel_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 주문 내역 테이블 생성 (orders)
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

-- 6. 게스트 기기 매핑 테이블 생성 (device_mappings)
CREATE TABLE device_mappings (
    fingerprint VARCHAR(128) NOT NULL,
    uid         VARCHAR(128) NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (fingerprint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;