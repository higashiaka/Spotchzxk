INSERT INTO app_state (state_key, state_value)
VALUES
    ('liquidity-events.quantity-jitter-min-percent', '45'),
    ('liquidity-events.quantity-jitter-max-percent', '135'),
    ('liquidity-events.dump-quantity-jitter-min-percent', '55'),
    ('liquidity-events.dump-quantity-jitter-max-percent', '165')
ON DUPLICATE KEY UPDATE state_value = state_value;
