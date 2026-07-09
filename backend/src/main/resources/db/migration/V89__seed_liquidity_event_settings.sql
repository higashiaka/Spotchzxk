INSERT INTO app_state (state_key, state_value)
VALUES
    ('liquidity-events.enabled', 'false'),
    ('liquidity-events.start-chance-percent', '0.15'),
    ('liquidity-events.daily-limit-per-stock', '1'),
    ('liquidity-events.tick-min-seconds', '12'),
    ('liquidity-events.tick-max-seconds', '35'),
    ('liquidity-events.min-duration-minutes', '10'),
    ('liquidity-events.max-duration-minutes', '30'),
    ('liquidity-events.min-rise-percent', '80'),
    ('liquidity-events.max-rise-percent', '300'),
    ('liquidity-events.dump-retain-percent', '35'),
    ('liquidity-events.cooldown-minutes', '360')
ON DUPLICATE KEY UPDATE state_value = state_value;
