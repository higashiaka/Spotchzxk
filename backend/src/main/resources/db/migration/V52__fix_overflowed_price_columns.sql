-- current_price가 음수인 종목은 AMM 풀(coin_reserve / share_reserve)로 복구
-- AMM 풀은 long 타입이라 overflow 없이 정확히 보존돼 있음
UPDATE stocks
SET current_price = FLOOR(coin_reserve / share_reserve)
WHERE current_price < 0
  AND share_reserve > 0;

-- base_price가 음수면 daily reset 때 overflow된 current_price를 복사한 것
-- 정확한 원래 값 복원이 불가하므로 현재 가격으로 대체
UPDATE stocks
SET base_price = current_price
WHERE base_price < 0;
