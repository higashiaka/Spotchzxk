UPDATE app_state
SET state_value = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
WHERE state_key = 'last_daily_reset_date'
  AND state_value = CURDATE();
