INSERT INTO app_state (state_key, state_value)
VALUES
    ('liquidity-events.stock-budget-refill-min-hours', '24'),
    ('liquidity-events.stock-budget-refill-max-hours', '30')
ON DUPLICATE KEY UPDATE state_value = state_value;
