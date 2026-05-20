-- ============================================================
-- 액면분할 스크립트 — current_price > 200,000 종목만 10:1 적용 (1회성)
-- 실행 후: 서버 재시작 필수 (인메모리 캐시 초기화)
-- ============================================================

START TRANSACTION;

-- 대상 종목 확인 (커밋 전 먼저 확인)
SELECT channel_id, streamer_name, current_price, base_price, total_supply
FROM stocks
WHERE current_price > 200000
ORDER BY current_price DESC;

-- 1. stocks: 가격 ÷10, 발행량 ×10
UPDATE stocks SET
    current_price = GREATEST(1, FLOOR(current_price / 10)),
    base_price    = GREATEST(1, FLOOR(base_price    / 10)),
    total_supply  = total_supply * 10
WHERE current_price > 200000;

-- 2. user_shares: 해당 종목 보유자 수량 ×10, 평균단가 ÷10
UPDATE user_shares us
JOIN stocks s ON us.channel_id = s.channel_id
SET
    us.quantity  = us.quantity * 10,
    us.avg_price = ROUND(us.avg_price / 10, 2)
WHERE s.current_price BETWEEN 20000 AND 200000;
-- ↑ UPDATE 후 already-divided 가격 기준: 원래 200001~이었던 종목이 20001~20000 범위로 들어옴

-- 결과 확인
SELECT channel_id, streamer_name, current_price, base_price, total_supply
FROM stocks
ORDER BY current_price DESC;

COMMIT;
-- ROLLBACK; -- 결과가 이상하면 COMMIT 대신 이걸로 되돌리기
