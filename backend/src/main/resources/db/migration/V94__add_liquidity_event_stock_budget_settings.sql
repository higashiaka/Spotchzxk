INSERT INTO app_state (state_key, state_value)
VALUES
    ('liquidity-events.stock-budget-amount', '500000000'),
    ('liquidity-events.stock-budget-refill-threshold', '50000000')
ON DUPLICATE KEY UPDATE state_value = state_value;
