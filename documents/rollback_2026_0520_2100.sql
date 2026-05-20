-- ============================================================
-- 전체 롤백 — 2026-05-20 21:00 KST 기준
-- 복구 범위: 종목 가격, 발행량, 유저 보유량, 유저 잔고, 주문 삭제
-- 실행 후: 서버 재시작 필수
-- ============================================================

SET @cutoff = 1779278400000; -- 2026-05-20 21:00 KST (= UTC 12:00)

START TRANSACTION;

-- ── 1. 종목 가격 복구 (21시 이전 마지막 체결가) ──────────────────────────────
UPDATE stocks s
SET s.current_price = COALESCE(
    (SELECT CAST(o.executed_price AS UNSIGNED)
     FROM orders o
     WHERE o.streamer_id = s.channel_id
       AND o.created_at <= @cutoff
       AND o.status = 'completed'
     ORDER BY o.created_at DESC
     LIMIT 1),
    s.base_price  -- 거래 기록 없으면 기준가로
);

-- ── 2. 발행량 복구 ──────────────────────────────────────────────────────────
UPDATE stocks s
SET s.total_supply = GREATEST(0, COALESCE(
    (SELECT SUM(CASE WHEN o.type = 'buy' THEN o.quantity ELSE -o.quantity END)
     FROM orders o
     WHERE o.streamer_id = s.channel_id
       AND o.created_at <= @cutoff
       AND o.status = 'completed'),
    0
));

-- ── 3. 유저 보유량 복구 ────────────────────────────────────────────────────
DELETE FROM user_shares;

INSERT INTO user_shares (user_id, channel_id, quantity, avg_price)
SELECT
    o.user_id,
    o.streamer_id,
    SUM(CASE WHEN o.type = 'buy' THEN o.quantity ELSE -o.quantity END) AS quantity,
    ROUND(
        SUM(CASE WHEN o.type = 'buy' THEN o.executed_price * o.quantity ELSE 0 END) /
        NULLIF(SUM(CASE WHEN o.type = 'buy' THEN o.quantity ELSE 0 END), 0),
    2) AS avg_price
FROM orders o
WHERE o.created_at <= @cutoff
  AND o.status = 'completed'
GROUP BY o.user_id, o.streamer_id
HAVING quantity > 0;

-- ── 4. 유저 잔고 복구 (초기 1000만 + 거래 손익) ──────────────────────────────
UPDATE users u
SET u.coin_balance = GREATEST(0, 10000000 + COALESCE(
    (SELECT SUM(
        CASE
            WHEN o.type = 'buy'  THEN -(o.executed_price * o.quantity * 1.01)
            WHEN o.type = 'sell' THEN  (o.executed_price * o.quantity * 0.99)
        END
     )
     FROM orders o
     WHERE o.user_id = u.id
       AND o.created_at <= @cutoff
       AND o.status = 'completed'),
    0
));

-- ── 5. 21시 이후 주문 삭제 ──────────────────────────────────────────────────
DELETE FROM orders WHERE created_at > @cutoff;

-- ── 결과 확인 ────────────────────────────────────────────────────────────────
SELECT channel_id, streamer_name, current_price, total_supply
FROM stocks
ORDER BY current_price DESC
LIMIT 20;

SELECT COUNT(*) AS remaining_orders FROM orders;

COMMIT;
-- ROLLBACK;
