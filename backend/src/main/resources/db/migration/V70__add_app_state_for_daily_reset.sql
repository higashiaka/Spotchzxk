CREATE TABLE IF NOT EXISTS app_state (
    state_key   VARCHAR(100) NOT NULL PRIMARY KEY,
    state_value VARCHAR(255) NOT NULL,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_state (state_key, state_value)
VALUES ('last_daily_reset_date', CURDATE())
ON DUPLICATE KEY UPDATE state_value = state_value;
