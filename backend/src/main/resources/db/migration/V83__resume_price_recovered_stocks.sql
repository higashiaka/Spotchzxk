UPDATE stocks
   SET trading_suspended = FALSE,
       trading_suspension_reason = NULL
 WHERE trading_suspended = TRUE
   AND trading_suspension_reason = 'PRICE_BELOW_ONE'
   AND (
       (
           coin_reserve IS NOT NULL
           AND share_reserve IS NOT NULL
           AND coin_reserve > 0
           AND share_reserve > 0
           AND coin_reserve / share_reserve >= 1
       )
       OR (
           (coin_reserve IS NULL OR share_reserve IS NULL OR coin_reserve <= 0 OR share_reserve <= 0)
           AND current_price >= 1
       )
   );
