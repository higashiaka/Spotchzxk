CREATE TABLE liquidity_events (
    id VARCHAR(36) PRIMARY KEY,
    channel_id VARCHAR(50) NOT NULL,
    phase VARCHAR(32) NOT NULL,
    started_at TIMESTAMP NOT NULL,
    phase_started_at TIMESTAMP NOT NULL,
    phase_ends_at TIMESTAMP NOT NULL,
    cooldown_until TIMESTAMP NULL,
    start_price DECIMAL(65, 6) NOT NULL,
    target_peak_price DECIMAL(65, 6) NOT NULL,
    dump_target_price DECIMAL(65, 6) NOT NULL,
    last_trade_at TIMESTAMP NULL,
    pump_trade_count INT NOT NULL DEFAULT 0,
    dump_trade_count INT NOT NULL DEFAULT 0,
    dump_steps INT NOT NULL DEFAULT 3,
    accumulated_buy_quantity DECIMAL(65, 0) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_liquidity_events_channel_phase (channel_id, phase),
    INDEX idx_liquidity_events_phase_end (phase, phase_ends_at),
    INDEX idx_liquidity_events_started (started_at),
    CONSTRAINT fk_liquidity_events_stock
        FOREIGN KEY (channel_id) REFERENCES stocks(channel_id)
);
