-- totalSupply를 user_shares 실제 보유량 합계로 정정
-- 초기화(reset) 시 totalSupply가 차감되지 않아 팬텀 supply가 누적된 문제를 일괄 수정
UPDATE stocks s
SET s.total_supply = COALESCE((
    SELECT SUM(us.quantity)
    FROM user_shares us
    WHERE us.channel_id = s.channel_id
      AND us.quantity > 0
), 0);
