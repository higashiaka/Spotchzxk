UPDATE stocks
SET total_supply = 0
WHERE channel_id NOT LIKE 'event-%';
