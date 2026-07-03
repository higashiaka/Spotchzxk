-- One-time grant for existing Google/Firebase registered users.
-- New policy: Google login starts at 20,000,000; Naver-linked users receive 30,000,000 total.
-- This grants the 10,000,000 delta to existing registered Google users that are not already Naver-linked.

START TRANSACTION;

UPDATE users
SET coin_balance = coin_balance + 10000000
WHERE is_bot = 0
  AND is_guest = 0
  AND naver_uid IS NULL
  AND id NOT LIKE 'naver:%';

SELECT ROW_COUNT() AS granted_user_count;

COMMIT;
