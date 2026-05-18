-- ============================================================
-- Spotchzxk — 운영/분석용 MySQL 쿼리 모음
-- ============================================================

CREATE DATABASE IF NOT EXISTS spotchzxk
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE spotchzxk;

-- ============================================================
-- 0. DB 초기화 (테이블 생성 + 기존 데이터 전체 삭제 후 시드 재삽입)
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS portfolio_shares;
DROP TABLE IF EXISTS portfolios;
DROP TABLE IF EXISTS device_mappings;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS streamers;

CREATE TABLE streamers (
    id          VARCHAR(100)  NOT NULL,
    name        VARCHAR(200)  NOT NULL,
    price       DECIMAL(12,2) NOT NULL DEFAULT 100.00,
    total_volume BIGINT       NOT NULL DEFAULT 0,
    created_at  DATETIME      NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE portfolios (
    user_id VARCHAR(128)  NOT NULL,
    balance DECIMAL(14,2) NOT NULL DEFAULT 10000.00,
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE portfolio_shares (
    user_id     VARCHAR(128) NOT NULL,
    streamer_id VARCHAR(100) NOT NULL,
    quantity    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, streamer_id),
    CONSTRAINT fk_ps_user     FOREIGN KEY (user_id)     REFERENCES portfolios(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_ps_streamer FOREIGN KEY (streamer_id) REFERENCES streamers(id)       ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE orders (
    id              VARCHAR(36)        NOT NULL,
    user_id         VARCHAR(128)       NOT NULL,
    streamer_id     VARCHAR(100)       NOT NULL,
    type            ENUM('buy','sell') NOT NULL,
    quantity        INT                NOT NULL,
    estimated_price DECIMAL(12,2)      NOT NULL,
    executed_price  DECIMAL(12,2),
    status          VARCHAR(20)        NOT NULL DEFAULT 'completed',
    created_at      BIGINT             NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_orders_user_id    (user_id),
    INDEX idx_orders_streamer_id (streamer_id),
    INDEX idx_orders_created_at  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE admins (
    user_id VARCHAR(128) NOT NULL,
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE device_mappings (
    fingerprint VARCHAR(128) NOT NULL,
    uid         VARCHAR(128) NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (fingerprint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO streamers (id, name, price, total_volume, created_at) VALUES
('chzzk-hle-delight', 'HLE Delight', 100, 820, NOW()),
('chzzk-hle-gumayusi', 'HLE Gumayusi', 100, 0, NOW()),
('chzzk-hle-kanavi', 'HLE Kanavi', 100, 0, NOW()),
('chzzk-hle-zeka', 'HLE Zeka', 100, 0, NOW()),
('chzzk-hle-zeus', 'HLE Zeus', 100, 0, NOW()),
('chzzk-kangsoyeon', '강소연', 100, 460, NOW()),
('chzzk-kangji', '강지', 100, 2980, NOW()),
('chzzk-kangqui', '강퀴', 100, 0, NOW()),
('chzzk-gaebogeo', '개복어', 100, 0, NOW()),
('chzzk-gankim', '갱맘', 100, 0, NOW()),
('chzzk-gyechunhwe', '계춘회', 100, 0, NOW()),
('chzzk-gochabi', '고차비', 100, 0, NOW()),
('chzzk-monster-mouse', '괴물쥐', 100, 0, NOW()),
('chzzk-geumsahyang', '금사향', 100, 0, NOW()),
('chzzk-geumhwi', '금휘', 100, 0, NOW()),
('chzzk-kimnaseong', '김나성', 100, 0, NOW()),
('chzzk-kimnambong', '김남봉', 100, 0, NOW()),
('chzzk-kimdo', '김도', 100, 0, NOW()),
('chzzk-kimdduddi', '김뚜띠', 100, 0, NOW()),
('chzzk-kimblue', '김블루', 100, 0, NOW()),
('chzzk-kimbbung', '김뿡', 100, 0, NOW()),
('chzzk-kimjungmin', '김정민', 100, 0, NOW()),
('chzzk-kimhorror', '김호러', 100, 0, NOW()),
('chzzk-kkolrangi', '꼴랑이', 100, 0, NOW()),
('chzzk-kkotbin', '꽃빈', 100, 0, NOW()),
('chzzk-kkotpin', '꽃핀', 100, 0, NOW()),
('chzzk-nanayang', '나나양', 100, 0, NOW()),
('chzzk-namgunghyuk', '남궁혁', 100, 0, NOW()),
('chzzk-neobul', '너불', 100, 0, NOW()),
('chzzk-neneko', '네네코 마시로', 100, 0, NOW()),
('chzzk-necrit', '네클릿', 100, 0, NOW()),
('chzzk-nofe', '노페', 100, 0, NOW()),
('chzzk-nokduro', '녹두로', 100, 0, NOW()),
('chzzk-nonggwan', '농관전', 100, 0, NOW()),
('chzzk-ns-box', '농심 BOX', 100, 0, NOW()),
('chzzk-ns-exito', '농심 Exito', 100, 0, NOW()),
('chzzk-ns-ryuk', '농심 RYUK', 100, 0, NOW()),
('chzzk-ns-ppuljebi', '농심 ppuljebi', 100, 0, NOW()),
('chzzk-ns-dambi', '농심 담비', 100, 0, NOW()),
('chzzk-ns-redforce', '농심 레드포스', 100, 0, NOW()),
('chzzk-ns-lehends', '농심 리헨즈', 100, 0, NOW()),
('chzzk-ns-scout', '농심 스카웃', 100, 0, NOW()),
('chzzk-ns-sponge', '농심 스폰지', 100, 0, NOW()),
('chzzk-ns-ivy', '농심 아이비', 100, 0, NOW()),
('chzzk-ns-albi', '농심 알비', 100, 0, NOW()),
('chzzk-ns-xross', '농심 엑스로스', 100, 0, NOW()),
('chzzk-ns-calix', '농심 칼릭스', 100, 0, NOW()),
('chzzk-ns-kingen', '농심 킹겐', 100, 0, NOW()),
('chzzk-ns-taeyoon', '농심 태윤', 100, 0, NOW()),
('chzzk-ns-francis', '농심 프란시스', 100, 0, NOW()),
('chzzk-nyorongi', '뇨롱이', 100, 0, NOW()),
('chzzk-noonkkot', '눈꽃', 100, 0, NOW()),
('chzzk-neujjam', '늦잠', 100, 0, NOW()),
('chzzk-ninia', '니니아', 100, 0, NOW()),
('chzzk-daju', '다주', 100, 0, NOW()),
('chzzk-dalkomrena', '달콤레나', 100, 0, NOW()),
('chzzk-dawn', '던', 100, 0, NOW()),
('chzzk-dopa', '도파', 100, 0, NOW()),
('chzzk-dokcake', '독케익', 100, 0, NOW()),
('chzzk-dunijuni', '두니주니', 100, 0, NOW()),
('chzzk-dunggeure', '둥그레', 100, 0, NOW()),
('chzzk-ddahyoni', '따효니', 100, 0, NOW()),
('chzzk-ttolttoli', '똘똘똘이', 100, 0, NOW()),
('chzzk-radiyu', '라디유', 100, 0, NOW()),
('chzzk-ralo', '랄로', 100, 0, NOW()),
('chzzk-lucky', '러끼', 100, 0, NOW()),
('chzzk-runner', '러너', 100, 0, NOW()),
('chzzk-reva', '레바', 100, 0, NOW()),
('chzzk-rutae', '루태', 100, 0, NOW()),
('chzzk-looksam', '룩삼', 100, 0, NOW()),
('chzzk-lilka', '릴카', 100, 0, NOW()),
('chzzk-mareflos', '마레플로스', 100, 0, NOW()),
('chzzk-mamwa', '마뫄', 100, 0, NOW()),
('chzzk-mangnae', '망내', 100, 0, NOW()),
('chzzk-mulluckking', '멀럭킹', 100, 0, NOW()),
('chzzk-mutsa', '멋사', 100, 0, NOW()),
('chzzk-medal', '명예훈장', 100, 0, NOW()),
('chzzk-morara', '모라라', 100, 0, NOW()),
('chzzk-mochahyung', '모카형', 100, 0, NOW()),
('chzzk-michir', '미치르', 100, 0, NOW()),
('chzzk-baedon', '배돈', 100, 0, NOW()),
('chzzk-baekgompa', '백곰파', 100, 0, NOW()),
('chzzk-bang', '뱅', 100, 0, NOW()),
('chzzk-brion-gideon', '브리온 기드온', 100, 0, NOW()),
('chzzk-brion-namgung', '브리온 남궁', 100, 0, NOW()),
('chzzk-brion-roamer', '브리온 로머', 100, 0, NOW()),
('chzzk-brion-loki', '브리온 로키', 100, 0, NOW()),
('chzzk-brion-casting', '브리온 캐스팅', 100, 0, NOW()),
('chzzk-brion-teddy', '브리온 테디', 100, 0, NOW()),
('chzzk-brion-fisher', '브리온 피셔', 100, 0, NOW()),
('chzzk-vicha', '브이챠', 100, 0, NOW()),
('chzzk-bighead', '빅헤드', 100, 0, NOW()),
('chzzk-ppibu', '삐부', 100, 0, NOW()),
('chzzk-sakihane', '사키하네 후야', 100, 0, NOW()),
('chzzk-salgu', '살구', 100, 0, NOW()),
('chzzk-samsik', '삼식', 100, 0, NOW()),
('chzzk-samway', '샘웨', 100, 0, NOW()),
('chzzk-seoneng', '서넹', 100, 0, NOW()),
('chzzk-saddummy', '서새봄', 100, 0, NOW()),
('chzzk-seolbaek', '설백', 100, 0, NOW()),
('chzzk-sonishow', '소니쇼', 100, 0, NOW()),
('chzzk-souler', '소우릎', 100, 0, NOW()),
('chzzk-sopoong', '소풍왔니', 100, 0, NOW()),
('chzzk-suryun', '수련수련', 100, 0, NOW()),
('chzzk-sherry', '쉐리', 100, 0, NOW()),
('chzzk-snarang', '스나랑', 100, 0, NOW()),
('chzzk-shirayuki', '시라유키 히나', 100, 0, NOW()),
('chzzk-sylph', '실프', 100, 0, NOW()),
('chzzk-ssangbe', '쌍베', 100, 0, NOW()),
('chzzk-crag', '씨랙', 100, 0, NOW()),
('chzzk-aguibbo', '아구이뽀', 100, 0, NOW()),
('chzzk-tabi', '아라하시 타비', 100, 0, NOW()),
('chzzk-arisa', '아리사', 100, 0, NOW()),
('chzzk-fatherking', '아빠킹', 100, 0, NOW()),
('chzzk-uni', '아야츠노 유니', 100, 0, NOW()),
('chzzk-rin', '아오쿠모 린', 100, 0, NOW()),
('chzzk-lize', '아카네 리제', 100, 0, NOW()),
('chzzk-ryu', '아카이로 류', 100, 0, NOW()),
('chzzk-ambition', '앰비션', 100, 0, NOW()),
('chzzk-yapyap', '얍얍', 100, 0, NOW()),
('chzzk-yadda', '얏따', 100, 0, NOW()),
('chzzk-yangdding', '양띵', 100, 0, NOW()),
('chzzk-yangaji', '양아지', 100, 0, NOW()),
('chzzk-eris', '에리스', 100, 0, NOW()),
('chzzk-elli', '엘리', 100, 0, NOW()),
('chzzk-youngdu', '영듀', 100, 0, NOW()),
('chzzk-oknyang', '옥냥이', 100, 0, NOW()),
('chzzk-wadid', '와디드', 100, 0, NOW()),
('chzzk-yoru', '요룰레히', 100, 0, NOW()),
('chzzk-untara', '운타라', 100, 0, NOW()),
('chzzk-wolf', '울프', 100, 0, NOW()),
('chzzk-yuzuha', '유즈하 리코', 100, 0, NOW()),
('chzzk-yunga', '윤가놈', 100, 0, NOW()),
('chzzk-eaglecob', '이글콥', 100, 0, NOW()),
('chzzk-irona', '이로나묭 치카', 100, 0, NOW()),
('chzzk-leesun', '이선생', 100, 0, NOW()),
('chzzk-leechohong', '이초홍', 100, 0, NOW()),
('chzzk-leechunhyang', '이춘향', 100, 0, NOW()),
('chzzk-inganjelly', '인간젤리', 100, 0, NOW()),
('chzzk-insec', '인섹', 100, 0, NOW()),
('chzzk-imnaeun', '임나은', 100, 0, NOW()),
('chzzk-jadong', '자동', 100, 0, NOW()),
('chzzk-jack', '잭', 100, 0, NOW()),
('chzzk-jongmal', '종말맨', 100, 0, NOW()),
('chzzk-judoongi', '주둥이방송', 100, 0, NOW()),
('chzzk-jinu', '지누', 100, 0, NOW()),
('chzzk-chaehyun', '채현찌', 100, 0, NOW()),
('chzzk-chulmyun', '철면수심', 100, 0, NOW()),
('chzzk-choseung', '초승달', 100, 0, NOW()),
('chzzk-chicken', '치킨쿤', 100, 0, NOW()),
('chzzk-karin', '카린', 100, 0, NOW()),
('chzzk-kandeer', '칸데르니아', 100, 0, NOW()),
('chzzk-captainjack', '캡틴잭', 100, 0, NOW()),
('chzzk-kane', '케인', 100, 0, NOW()),
('chzzk-kongkong', '콩콩', 100, 0, NOW()),
('chzzk-kuha', '쿠하', 100, 0, NOW()),
('chzzk-cuvee', '큐베', 100, 0, NOW()),
('chzzk-crank', '크랭크', 100, 0, NOW()),
('chzzk-ccat', '크캣', 100, 0, NOW()),
('chzzk-tamttam', '탬탬버린', 100, 0, NOW()),
('chzzk-tenko', '텐코 시부키', 100, 0, NOW()),
('chzzk-paka', '파카', 100, 0, NOW()),
('chzzk-portia', '포셔', 100, 0, NOW()),
('chzzk-purin', '푸린', 100, 0, NOW()),
('chzzk-poong', '풍월량', 100, 0, NOW()),
('chzzk-flurry', '플러리', 100, 0, NOW()),
('chzzk-flame', '플레임', 100, 0, NOW()),
('chzzk-phoenixpark', '피닉스박', 100, 0, NOW()),
('chzzk-pingman', '핑맨', 100, 0, NOW()),
('chzzk-hanako', '하나코 나나', 100, 0, NOW()),
('chzzk-haruto', '하루토', 100, 0, NOW()),
('chzzk-haha', '하하', 100, 0, NOW()),
('chzzk-doodoo', '한동숙', 100, 0, NOW()),
('chzzk-haeverlin', '해블린', 100, 0, NOW()),
('chzzk-haetsal', '햇살살', 100, 0, NOW()),
('chzzk-hangdol', '행돌', 100, 0, NOW()),
('chzzk-hyang', '향아치', 100, 0, NOW()),
('chzzk-honeychu', '허니츄러스', 100, 0, NOW()),
('chzzk-hejil', '헤징', 100, 0, NOW()),
('chzzk-huchu', '후추', 100, 0, NOW()),
('chzzk-hiren', '히렌', 100, 0, NOW());
-- Total: 181 streamers


-- ============================================================
-- 1. 시장 현황
-- ============================================================

-- 전체 스트리머 시세 (거래량 내림차순, 마켓 보드 기준)
SELECT id, name, price, total_volume
FROM streamers
ORDER BY total_volume DESC;

-- 거래량 상위 10개 종목
SELECT id, name, price, total_volume
FROM streamers
ORDER BY total_volume DESC
LIMIT 10;

-- 가격 상위/하위 10개 종목
SELECT id, name, price
FROM streamers
ORDER BY price DESC
LIMIT 10;

SELECT id, name, price
FROM streamers
ORDER BY price ASC
LIMIT 10;

-- 초기가($100) 대비 등락률
SELECT
    id,
    name,
    price,
    ROUND((price - 100) / 100 * 100, 2) AS change_pct
FROM streamers
ORDER BY change_pct DESC;

-- 거래 없는 종목 (볼륨 0)
SELECT id, name FROM streamers WHERE total_volume = 0;


-- ============================================================
-- 2. 포트폴리오 조회
-- ============================================================

-- 특정 유저 포트폴리오 (잔고 + 보유 종목 + 평가금액)
SELECT
    p.user_id,
    p.balance,
    ps.streamer_id,
    s.name        AS streamer_name,
    ps.quantity,
    s.price       AS current_price,
    ROUND(ps.quantity * s.price, 2) AS market_value
FROM portfolios p
LEFT JOIN portfolio_shares ps ON ps.user_id = p.user_id
LEFT JOIN streamers s         ON s.id = ps.streamer_id
WHERE p.user_id = 'YOUR_USER_ID'  -- ← 유저 UID로 교체
  AND (ps.quantity IS NULL OR ps.quantity > 0);

-- 특정 유저 총 자산 (잔고 + 주식 평가금액)
SELECT
    p.user_id,
    p.balance,
    COALESCE(SUM(ps.quantity * s.price), 0) AS stock_value,
    ROUND(p.balance + COALESCE(SUM(ps.quantity * s.price), 0), 2) AS total_asset
FROM portfolios p
LEFT JOIN portfolio_shares ps ON ps.user_id = p.user_id
LEFT JOIN streamers s         ON s.id = ps.streamer_id
WHERE p.user_id = 'YOUR_USER_ID'
GROUP BY p.user_id, p.balance;

-- 전체 유저 총 자산 순위 (리치 리스트)
SELECT
    p.user_id,
    ROUND(p.balance + COALESCE(SUM(ps.quantity * s.price), 0), 2) AS total_asset
FROM portfolios p
LEFT JOIN portfolio_shares ps ON ps.user_id = p.user_id
LEFT JOIN streamers s         ON s.id = ps.streamer_id
GROUP BY p.user_id, p.balance
ORDER BY total_asset DESC
LIMIT 20;

-- 총 등록 유저 수
SELECT COUNT(*) AS total_users FROM portfolios;

-- 잔고가 초기값($10,000)에서 변하지 않은 유저 (거래 0회)
SELECT user_id FROM portfolios WHERE balance = 10000.00
  AND user_id NOT IN (SELECT DISTINCT user_id FROM orders);


-- ============================================================
-- 3. 거래 내역 조회
-- ============================================================

-- 특정 유저 최근 거래 15건
SELECT
    o.id,
    o.type,
    o.streamer_id,
    s.name       AS streamer_name,
    o.quantity,
    o.estimated_price,
    o.executed_price,
    o.status,
    FROM_UNIXTIME(o.created_at / 1000) AS traded_at
FROM orders o
JOIN streamers s ON s.id = o.streamer_id
WHERE o.user_id = 'YOUR_USER_ID'
ORDER BY o.created_at DESC
LIMIT 15;

-- 특정 종목 전체 거래 내역
SELECT
    o.user_id,
    o.type,
    o.quantity,
    o.executed_price,
    FROM_UNIXTIME(o.created_at / 1000) AS traded_at
FROM orders o
WHERE o.streamer_id = 'chzzk-kangji'  -- ← 종목 ID로 교체
ORDER BY o.created_at DESC;

-- 오늘 하루 전체 거래량 및 거래 건수
SELECT
    COUNT(*)           AS total_orders,
    SUM(quantity)      AS total_volume,
    SUM(CASE WHEN type='buy'  THEN quantity ELSE 0 END) AS buy_volume,
    SUM(CASE WHEN type='sell' THEN quantity ELSE 0 END) AS sell_volume
FROM orders
WHERE created_at >= UNIX_TIMESTAMP(CURDATE()) * 1000;

-- 종목별 오늘 거래 순매수량 (buy - sell)
SELECT
    o.streamer_id,
    s.name,
    SUM(CASE WHEN o.type='buy'  THEN o.quantity ELSE 0 END) AS buy_vol,
    SUM(CASE WHEN o.type='sell' THEN o.quantity ELSE 0 END) AS sell_vol,
    SUM(CASE WHEN o.type='buy'  THEN o.quantity ELSE -o.quantity END) AS net_vol
FROM orders o
JOIN streamers s ON s.id = o.streamer_id
WHERE o.created_at >= UNIX_TIMESTAMP(CURDATE()) * 1000
GROUP BY o.streamer_id, s.name
ORDER BY net_vol DESC;

-- 가장 많이 거래된 종목 TOP 10 (전체 누적)
SELECT
    o.streamer_id,
    s.name,
    COUNT(*)       AS order_count,
    SUM(o.quantity) AS total_qty
FROM orders o
JOIN streamers s ON s.id = o.streamer_id
GROUP BY o.streamer_id, s.name
ORDER BY total_qty DESC
LIMIT 10;

-- 가장 활발한 유저 TOP 10
SELECT
    user_id,
    COUNT(*)        AS order_count,
    SUM(quantity)   AS total_qty
FROM orders
GROUP BY user_id
ORDER BY order_count DESC
LIMIT 10;


-- ============================================================
-- 4. 관리자 / 유지보수
-- ============================================================

-- 관리자 목록 조회
SELECT user_id FROM admins;

-- 관리자 추가
INSERT IGNORE INTO admins (user_id) VALUES ('FIREBASE_UID_HERE');

-- 관리자 제거
DELETE FROM admins WHERE user_id = 'FIREBASE_UID_HERE';

-- 게스트 디바이스 매핑 조회 (최근 10건)
SELECT fingerprint, uid, created_at
FROM device_mappings
ORDER BY created_at DESC
LIMIT 10;

-- 특정 유저 포트폴리오 초기화 (잔고 $10,000, 주식 전체 삭제)
START TRANSACTION;
UPDATE portfolios SET balance = 10000.00 WHERE user_id = 'TARGET_USER_ID';
DELETE FROM portfolio_shares WHERE user_id = 'TARGET_USER_ID';
COMMIT;

-- 전체 스트리머 가격 초기화 ($100, 볼륨 0)
SET SQL_SAFE_UPDATES = 0;
UPDATE streamers SET price = 100.00, total_volume = 0;
SET SQL_SAFE_UPDATES = 1;

-- 특정 스트리머 가격 수동 조정
UPDATE streamers SET price = 150.00 WHERE id = 'chzzk-kangji';

-- 일일 볼륨 리셋 (TradeEngine의 @Scheduled와 동일한 작업)
SET SQL_SAFE_UPDATES = 0;
UPDATE streamers SET total_volume = 0;
SET SQL_SAFE_UPDATES = 1;


-- ============================================================
-- 5. 시장 통계 분석
-- ============================================================

-- 스트리머별 보유자 수 (주주 수)
SELECT
    ps.streamer_id,
    s.name,
    COUNT(DISTINCT ps.user_id) AS holder_count,
    SUM(ps.quantity)           AS total_held
FROM portfolio_shares ps
JOIN streamers s ON s.id = ps.streamer_id
WHERE ps.quantity > 0
GROUP BY ps.streamer_id, s.name
ORDER BY holder_count DESC;

-- 특정 스트리머 주주 목록 + 보유 수량
SELECT
    ps.user_id,
    ps.quantity,
    ROUND(ps.quantity * s.price, 2) AS market_value
FROM portfolio_shares ps
JOIN streamers s ON s.id = ps.streamer_id
WHERE ps.streamer_id = 'chzzk-kangji'  -- ← 종목 ID로 교체
  AND ps.quantity > 0
ORDER BY ps.quantity DESC;

-- 시간대별 거래 건수 (오늘, KST 기준)
SELECT
    HOUR(CONVERT_TZ(FROM_UNIXTIME(created_at / 1000), '+00:00', '+09:00')) AS hour_kst,
    COUNT(*) AS order_count,
    SUM(quantity) AS volume
FROM orders
WHERE created_at >= UNIX_TIMESTAMP(CURDATE()) * 1000
GROUP BY hour_kst
ORDER BY hour_kst;

-- 평균 체결가 vs 예상가 괴리 (슬리피지 분석)
SELECT
    streamer_id,
    ROUND(AVG(executed_price - estimated_price), 4) AS avg_slippage,
    ROUND(AVG(ABS(executed_price - estimated_price)), 4) AS avg_abs_slippage
FROM orders
WHERE executed_price IS NOT NULL
GROUP BY streamer_id
ORDER BY avg_abs_slippage DESC;

-- 전체 유저 총 잔고 합산 (시스템 내 현금 총량)
SELECT
    ROUND(SUM(balance), 2)  AS total_cash,
    COUNT(*)                AS user_count,
    ROUND(AVG(balance), 2)  AS avg_balance
FROM portfolios;

-- 전체 시스템 시가총액 (발행된 주식 평가금액 총합)
SELECT
    ROUND(SUM(ps.quantity * s.price), 2) AS total_market_cap
FROM portfolio_shares ps
JOIN streamers s ON s.id = ps.streamer_id
WHERE ps.quantity > 0;
