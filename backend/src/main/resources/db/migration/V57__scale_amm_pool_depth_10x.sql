ALTER TABLE stocks
    MODIFY coin_reserve  DECIMAL(65, 0) NOT NULL DEFAULT 0,
    MODIFY share_reserve DECIMAL(65, 0) NOT NULL DEFAULT 0,
    MODIFY fee_pool      DECIMAL(65, 0) NOT NULL DEFAULT 0;

-- Deepen only AMM pools that are shallow relative to issued shares.
-- Multiplying both reserves by the same factor preserves coin_reserve / share_reserve.
UPDATE stocks s
JOIN (
    SELECT
        channel_id,
        LEAST(
            100,
            CEIL((CAST(issued_shares AS DECIMAL(65, 0)) * 10) / share_reserve)
        ) AS scale_factor
    FROM stocks
    WHERE coin_reserve > 0
      AND share_reserve > 0
      AND issued_shares > 0
      AND CAST(issued_shares AS DECIMAL(65, 0)) * 2 >= share_reserve
) x ON x.channel_id = s.channel_id
SET s.coin_reserve = s.coin_reserve * x.scale_factor,
    s.share_reserve = s.share_reserve * x.scale_factor
WHERE x.scale_factor >= 2;
