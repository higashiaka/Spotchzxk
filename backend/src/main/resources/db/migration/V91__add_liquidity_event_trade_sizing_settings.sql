INSERT INTO app_state (state_key, state_value)
VALUES
    ('liquidity-events.buy-quantity-min', '10'),
    ('liquidity-events.buy-quantity-max', '15'),
    ('liquidity-events.sell-holding-min-percent', '12'),
    ('liquidity-events.sell-holding-max-percent', '32'),
    ('liquidity-events.dump-sell-holding-min-percent', '25'),
    ('liquidity-events.dump-sell-holding-max-percent', '55')
ON DUPLICATE KEY UPDATE state_value = state_value;
