-- current_price가 0 이하인 종목을 AMM 풀 비율로 복구
-- AMM 풀이 정상(> 0)인 종목만 대상으로 함
UPDATE stocks
SET current_price = GREATEST(1, FLOOR(coin_reserve / share_reserve))
WHERE current_price <= 0
  AND coin_reserve > 0
  AND share_reserve > 0;

-- AMM 풀도 없는 경우 listing_price 기준으로 복구
UPDATE stocks
SET current_price = GREATEST(1, listing_price)
WHERE current_price <= 0;
