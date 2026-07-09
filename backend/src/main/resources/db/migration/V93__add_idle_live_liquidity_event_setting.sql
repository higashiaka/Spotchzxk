INSERT INTO app_state (state_key, state_value)
VALUES
    ('liquidity-events.idle-live-start-chance-percent', '1')
ON DUPLICATE KEY UPDATE state_value = state_value;
