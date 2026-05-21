-- ================================================================
-- SpotChzxk 데이터 롤백: 2026-05-20 21:00 KST 기준
-- 백업 없이 해당 시점 이후 데이터 역산 삭제
-- V25 (megaphone_posts), V26 (issued_shares) 스키마 반영
-- ================================================================

-- 2026-05-20 21:00:00 KST = epoch ms
-- KST(UTC+9) 기준이므로 서버 timezone 무관하게 고정값 사용
USE spotchzxk;

-- serverTimezone=Asia/Seoul 확인됨 → KST 기준 그대로 사용
SET @rollback_ts_ms  = 1779278400000;        -- 2026-05-20 12:00:00 UTC (= KST 21:00)
SET @rollback_dt_kst = '2026-05-20 21:00:00';

SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- ────────────────────────────────────────────────────────────────
-- STEP 1. 유저 잔액 역산
--   삭제 예정인 completed 주문을 먼저 반영:
--   매수 역산 → 지불했던 금액 환불
--   매도 역산 → 받았던 금액 차감
--   배당 역산 → 받았던 배당 차감
-- ────────────────────────────────────────────────────────────────
UPDATE users u
SET coin_balance = coin_balance
    + COALESCE((
        SELECT SUM(
            CASE
                WHEN type = 'buy'  THEN  executed_price * quantity   -- 매수 취소 → 환불
                WHEN type = 'sell' THEN -(executed_price * quantity)  -- 매도 취소 → 차감
                ELSE 0
            END
        )
        FROM orders
        WHERE user_id = u.id
          AND status = 'completed'
          AND user_id != '__house__'
          AND created_at > @rollback_ts_ms
    ), 0)
    - COALESCE((
        SELECT SUM(amount)
        FROM user_dividend_logs
        WHERE user_id = u.id
          AND created_at > @rollback_dt_kst
    ), 0)
WHERE u.id != '__house__';

-- dividend_total 역산
UPDATE users u
SET dividend_total = GREATEST(0, dividend_total - COALESCE((
    SELECT SUM(amount)
    FROM user_dividend_logs
    WHERE user_id = u.id
      AND created_at > @rollback_dt_kst
), 0))
WHERE u.id != '__house__';

-- ────────────────────────────────────────────────────────────────
-- STEP 2. 보유 주식 수량 역산
-- ────────────────────────────────────────────────────────────────
UPDATE user_shares us
SET quantity = quantity + COALESCE((
    SELECT SUM(
        CASE
            WHEN type = 'buy'  THEN -quantity   -- 매수 역산 → 감소
            WHEN type = 'sell' THEN  quantity   -- 매도 역산 → 증가
            ELSE 0
        END
    )
    FROM orders
    WHERE user_id  = us.user_id
      AND streamer_id = us.channel_id
      AND status   = 'completed'
      AND user_id  != '__house__'
      AND created_at > @rollback_ts_ms
), 0);

-- 수량 0 이하 행 제거
DELETE FROM user_shares WHERE quantity <= 0;

-- ────────────────────────────────────────────────────────────────
-- STEP 3. 주가 복원 — 롤백 시점 직전 마지막 체결가
-- ────────────────────────────────────────────────────────────────
UPDATE stocks s
JOIN (
    SELECT o.streamer_id, o.executed_price
    FROM orders o
    INNER JOIN (
        SELECT streamer_id, MAX(created_at) AS last_ts
        FROM orders
        WHERE status = 'completed'
          AND created_at <= @rollback_ts_ms
        GROUP BY streamer_id
    ) latest ON o.streamer_id = latest.streamer_id
            AND o.created_at  = latest.last_ts
    WHERE o.status = 'completed'
) last_trade ON s.channel_id = last_trade.streamer_id
SET s.current_price = last_trade.executed_price;

-- ────────────────────────────────────────────────────────────────
-- STEP 4. 롤백 시점 이후 데이터 삭제
-- ────────────────────────────────────────────────────────────────
DELETE FROM orders         WHERE created_at > @rollback_ts_ms;
DELETE FROM dividend_logs  WHERE created_at > @rollback_dt_kst;
DELETE FROM user_dividend_logs WHERE created_at > @rollback_dt_kst;

-- megaphone_posts: 테이블 자체가 2026-05-21 생성 → 전체 삭제
TRUNCATE TABLE megaphone_posts;

-- ────────────────────────────────────────────────────────────────
-- STEP 5. issued_shares 재계산 (V26 신규 컬럼)
-- ────────────────────────────────────────────────────────────────
UPDATE stocks s
SET issued_shares = (
    SELECT COALESCE(SUM(us.quantity), 0)
    FROM user_shares us
    WHERE us.channel_id = s.channel_id
      AND us.user_id != '__house__'
);

-- ────────────────────────────────────────────────────────────────
-- STEP 6. daily_volume 초기화 (어차피 새 거래로 채워짐)
-- ────────────────────────────────────────────────────────────────
UPDATE stocks SET daily_volume = 0;

-- ────────────────────────────────────────────────────────────────
-- STEP 7. 라이브 상태 초기화 (배당 풀, 시작시각 등)
-- ────────────────────────────────────────────────────────────────
UPDATE stocks
SET dividend_pool                = 0,
    dividend_accumulation_count  = 0,
    live_started_at              = NULL;

SET FOREIGN_KEY_CHECKS = 1;

-- 이상 없으면 커밋, 문제 있으면 ROLLBACK;
COMMIT;

-- ================================================================
-- 실행 후 확인 쿼리
-- ================================================================
-- SELECT channel_id, streamer_name, current_price, issued_shares FROM stocks;
-- SELECT u.id, u.coin_balance FROM users u WHERE u.id != '__house__' LIMIT 20;
-- SELECT COUNT(*) FROM orders;
