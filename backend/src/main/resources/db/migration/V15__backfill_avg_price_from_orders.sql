UPDATE user_shares us
JOIN (
    SELECT user_id,
           streamer_id,
           SUM(executed_price * quantity) / SUM(quantity) AS calc_avg
    FROM orders
    WHERE type = 'buy'
      AND status = 'completed'
    GROUP BY user_id, streamer_id
) o ON us.user_id = o.user_id
   AND us.channel_id = o.streamer_id
SET us.avg_price = o.calc_avg
WHERE us.avg_price = 0;
