-- Correct totalSupply to match the actual sum of user_shares quantities
-- Bulk fix for phantom supply accumulation caused by totalSupply not being decremented on reset
UPDATE stocks s
SET s.total_supply = COALESCE((
    SELECT SUM(us.quantity)
    FROM user_shares us
    WHERE us.channel_id = s.channel_id
      AND us.quantity > 0
), 0);
