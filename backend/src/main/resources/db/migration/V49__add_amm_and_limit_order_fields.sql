-- AMM pool fields for each stock
ALTER TABLE stocks
    ADD COLUMN coin_reserve    BIGINT NOT NULL DEFAULT 0 COMMENT 'AMM pool: coin reserve',
    ADD COLUMN share_reserve   BIGINT NOT NULL DEFAULT 0 COMMENT 'AMM pool: share reserve',
    ADD COLUMN fee_pool        BIGINT NOT NULL DEFAULT 0 COMMENT 'accumulated trading fees for dividend distribution',
    ADD COLUMN liquidity_tier  INT    NOT NULL DEFAULT 1 COMMENT '1=소형 2=중형 3=대형 4=블루칩';

-- Extend orders table for full limit order support
ALTER TABLE orders
    ADD COLUMN filled_quantity BIGINT       NOT NULL DEFAULT 0 COMMENT 'quantity filled so far (for partial fills)',
    ADD COLUMN allow_partial   BOOLEAN      NOT NULL DEFAULT FALSE COMMENT 'allow partial fill',
    ADD COLUMN expires_at      DATETIME     NULL COMMENT 'expiry time for limit orders (NULL = market order)';

-- Titles granted to users (cheering tiers, season participation, etc.)
CREATE TABLE titles (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    user_id     VARCHAR(255) NOT NULL,
    stock_id    VARCHAR(50)  NULL     COMMENT 'NULL = global title',
    title_type  VARCHAR(50)  NOT NULL COMMENT 'e.g. BETA_SEASON, CHEER_1, CHEER_2, CHEER_3',
    granted_at  DATETIME     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_stock_title (user_id, stock_id, title_type)
);

-- Cheering log (coin burn records per stock)
CREATE TABLE cheer_logs (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    user_id      VARCHAR(255) NOT NULL,
    stock_id     VARCHAR(50)  NOT NULL,
    burned_coins BIGINT       NOT NULL,
    created_at   DATETIME     NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_cheer_user_stock (user_id, stock_id)
);
