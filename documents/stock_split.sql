-- ============================================================
-- 액면분할 스크립트 — current_price > 200,000 종목만 10:1 적용 (반복 실행 가능)
-- 실행 후: 서버 재시작 필수 (인메모리 캐시 초기화)
-- ============================================================

START TRANSACTION;

-- 대상 종목 확인 (커밋 전 먼저 확인)
SELECT channel_id, streamer_name, current_price, base_price, total_supply
FROM stocks
WHERE current_price > 200000
ORDER BY current_price DESC;

-- 1. 분할 대상 channel_id를 stocks UPDATE 전에 캡처 (조건 오염 방지)
CREATE TEMPORARY TABLE IF NOT EXISTS _split_targets AS
    SELECT channel_id FROM stocks WHERE current_price > 200000;

-- 2. stocks: 가격 ÷10, 발행량 ×10
UPDATE stocks SET
    current_price = GREATEST(1, FLOOR(current_price / 10)),
    base_price    = GREATEST(1, FLOOR(base_price    / 10)),
    total_supply  = total_supply * 10
WHERE channel_id IN (SELECT channel_id FROM _split_targets);

-- 3. user_shares: 분할 종목 보유자만 수량 ×10, 평균단가 ÷10
UPDATE user_shares SET
    quantity  = quantity * 10,
    avg_price = ROUND(avg_price / 10, 2)
WHERE channel_id IN (SELECT channel_id FROM _split_targets);

DROP TEMPORARY TABLE _split_targets;

-- 결과 확인
SELECT channel_id, streamer_name, current_price, base_price, total_supply
FROM stocks
ORDER BY current_price DESC;

COMMIT;
-- ROLLBACK; -- 결과가 이상하면 COMMIT 대신 이걸로 되돌리기
