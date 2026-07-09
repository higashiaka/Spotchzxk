INSERT INTO app_state (state_key, state_value)
VALUES
    ('liquidity-events.accumulation-buy-chance-percent', '88'),
    ('liquidity-events.pump-buy-chance-percent', '82'),
    ('liquidity-events.climax-buy-chance-percent', '94'),
    ('liquidity-events.global-trade-cooldown-min-seconds', '30'),
    ('liquidity-events.global-trade-cooldown-max-seconds', '90')
ON DUPLICATE KEY UPDATE state_value = state_value;
