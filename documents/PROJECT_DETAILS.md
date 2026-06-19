# Spotchzxk 프로젝트 세부 정보 정리

작성일: 2026-06-16 / 최종 업데이트: 2026-06-16  
기준 문서: `documents/BACKEND_OVERVIEW.md`, `documents/FRONTEND_OVERVIEW.md`  
목적: 백엔드/프론트엔드 구조 설명 외에 운영, 배포, 데이터, 출시, 장애 대응에 필요한 세부 정보를 한곳에 정리한다.

---

## 1. 문서의 위치

이 문서는 코드 구조 설명서가 아니라 프로젝트 운영 지식 문서다. 코드 흐름 자체는 아래 두 문서를 먼저 본다.

| 문서 | 역할 |
| --- | --- |
| `BACKEND_OVERVIEW.md` | 백엔드 패키지 구조, 도메인 모델, 거래/배당/분할/API/스케줄러 설명 |
| `FRONTEND_OVERVIEW.md` | 프론트엔드 앱 구조, 화면, 인증, React Query, STOMP, 주문 UI 설명 |
| `PROJECT_DETAILS.md` | 환경변수, 배포, DB 운영, 출시 정책, 장애 대응, 문서 체계 설명 |

보조 메모 문서들은 로컬 `documents/test/`에 보관할 수 있지만, 해당 폴더는 `.gitignore`에 포함되어 원격 레포에는 올라가지 않는다. 원격 레포의 공식 문서는 README와 위 3개 문서를 기준으로 유지한다.

| 파일 | 설명 |
| --- | --- |
| `maintenance.html` | 점검 모드에서 Nginx가 서빙하는 HTML. |

---

## 2. 현재 프로젝트 요약

Spotchzxk는 React 프론트엔드와 Spring Boot 백엔드로 구성된 치지직 스트리머 모의 주식 거래 서비스다.

```text
사용자 브라우저
  -> React/Vite SPA
  -> Firebase Auth
  -> REST API /api/*
  -> STOMP WebSocket /ws
  -> Spring Boot backend
  -> MySQL + Flyway
  -> Chzzk OpenAPI
```

핵심 런타임 구성:

| 구성요소 | 역할 |
| --- | --- |
| Frontend | 사용자 화면, Firebase 로그인, REST/STOMP 클라이언트 |
| Backend | 인증 검증, 거래/배당/분할/상점/랭킹 로직 |
| MySQL | 사용자, 종목, 주문, 보유량, 배당, 확성기 등 영속 저장 |
| Redis | 게스트 abuse protection 등 보조 저장소 |
| Firebase Auth | Google/익명 사용자 인증 |
| Firebase Admin SDK | 백엔드 ID Token 검증 |
| Chzzk OpenAPI | 채널 정보와 라이브 상태 조회 |
| Nginx | 정적 파일 서빙, API/WebSocket reverse proxy, 점검 모드 |
| Cloudflare | HTTPS, DNS, WebSocket proxy, real client IP 전달 |

---

## 3. 환경 변수 정리

### 백엔드 `.env`

백엔드는 `backend/bootRun`과 운영 systemd에서 환경변수를 읽는다. 로컬에서는 `backend/.env`가 있으면 Gradle `bootRun`이 값을 주입한다.

| 변수 | 예시 | 설명 |
| --- | --- | --- |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_NAME` | `spotchzxk` | DB 이름 |
| `DB_USERNAME` | `spotchzxk` | DB 사용자 |
| `DB_PASSWORD` | `...` | DB 비밀번호 |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | 빈 값 또는 비밀번호 | Redis 비밀번호 |
| `PORT` | `8080` | Spring Boot 서버 포트 |
| `CORS_ORIGIN` | `http://localhost:5173,https://spotchzxk.xyz` | 허용할 프론트 origin 목록 |
| `ADMIN_API_KEY` | 운영 비밀값 | `/api/admin/**`의 `X-Admin-Key` 검증값 |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | `serviceAccountKey.json` | Firebase Admin service account JSON 경로 |
| `GUEST_ABUSE_ENABLED` | `true` | 게스트 생성 제한 사용 여부 |
| `GUEST_ABUSE_WINDOW_SECONDS` | `300` | 게스트 생성 제한 window |
| `GUEST_ABUSE_MAX_NEW_GUESTS_PER_WINDOW` | `3` | window 내 허용 신규 게스트 수 |
| `GUEST_ABUSE_BLOCK_SECONDS` | `300` | 제한 시 차단 시간 |
| `GUEST_ABUSE_TRUSTED_PROXY_CIDRS` | `127.0.0.1/32,...` | 신뢰할 proxy 대역 |

현재 `application.yml`에는 `bot.activity.*`, `system-sell.pressure.*` 설정도 남아 있다. 현재 코드 트리에는 대응 서비스가 없으므로 운영 정책으로 쓰기 전에 실제 구현 여부를 먼저 확인한다.

### 프론트엔드 `.env`

| 변수 | 예시 | 설명 |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase 콘솔 값 | Firebase client config |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase 콘솔 값 | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase 콘솔 값 | Firebase project id |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase 콘솔 값 | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase 콘솔 값 | Firebase sender id |
| `VITE_FIREBASE_APP_ID` | Firebase 콘솔 값 | Firebase app id |
| `VITE_API_BASE_URL` | `http://localhost:8080` 또는 `https://spotchzxk.xyz` | REST API base URL |
| `VITE_WS_URL` | `http://localhost:8080/ws` 또는 `https://spotchzxk.xyz/ws` | SockJS/STOMP endpoint |

Vite 개발 서버는 기본 설정에서 `/api`, `/ws`를 `https://spotchzxk.xyz`로 프록시한다. 로컬 백엔드로 붙일 때는 env 또는 proxy를 조정한다.

---

## 4. 로컬 개발 기준

### 백엔드

```powershell
cd backend
.\gradlew.bat bootRun
```

필요 조건:

- Java 17
- MySQL
- Redis
- Firebase service account JSON
- `backend/.env`

백엔드 확인:

```powershell
curl http://localhost:8080/health
curl http://localhost:8080/api/stocks
```

### 프론트엔드

```powershell
cd frontend
npm install
npm run dev
```

기본 개발 주소:

```text
http://localhost:5173
```

### 함께 실행할 때

권장 로컬 연결:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:8080
WS:       http://localhost:8080/ws
```

프론트 `.env`:

```dotenv
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=http://localhost:8080/ws
```

백엔드 `.env`:

```dotenv
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

---

## 5. 운영 배포 구조

운영 배포 기준은 OCI VM + Nginx + systemd + MySQL이다.

```text
사용자
  -> Cloudflare HTTPS
  -> OCI VM Nginx :80
     -> frontend/dist 정적 파일
     -> /api/* proxy http://localhost:8080
     -> /ws proxy http://localhost:8080
  -> Spring Boot systemd service
  -> MySQL/Redis
```

운영 경로 예시:

| 경로 | 용도 |
| --- | --- |
| `/opt/spotchzxk` | 프로젝트 checkout |
| `/opt/spotchzxk/frontend/dist` | 프론트 빌드 결과 |
| `/opt/spotchzxk/backend/.env` | 백엔드 운영 환경변수 |
| `/opt/spotchzxk/backend/serviceAccountKey.json` | Firebase Admin key |
| `/etc/systemd/system/spotchzxk.service` | 백엔드 systemd unit |
| `/etc/nginx/sites-available/spotchzxk` | Nginx site 설정 |
| `/opt/spotchzxk/maintenance.flag` | 점검 모드 toggle 파일 |

배포 상세 절차와 운영 체크리스트는 이 문서의 배포/점검/장애 대응 섹션을 기준으로 한다.

---

## 6. 배포 작업 패턴

### 프론트엔드만 변경

```bash
cd /opt/spotchzxk
git pull
cd frontend
npm install      # package.json 변경 시
npm run build
```

백엔드 재시작과 Nginx reload는 일반적으로 필요 없다.

### 백엔드만 변경

```bash
cd /opt/spotchzxk
git pull
cd backend
./gradlew bootJar -x test
sudo systemctl restart spotchzxk
sudo journalctl -u spotchzxk -f
```

Flyway migration이 추가된 경우 앱 시작 시 자동 적용된다. 운영 DB에 적용하기 전 백업과 스테이징 리허설을 우선한다.

### 프론트엔드 + 백엔드 변경

```bash
cd /opt/spotchzxk
git pull

cd frontend
npm run build

cd /opt/spotchzxk/backend
./gradlew bootJar -x test
sudo systemctl restart spotchzxk
```

### 환경변수 변경

백엔드 `.env` 변경:

```bash
sudo nano /opt/spotchzxk/backend/.env
sudo systemctl restart spotchzxk
```

프론트 `.env` 변경:

```bash
cd /opt/spotchzxk/frontend
npm run build
```

프론트 env는 빌드 타임에 번들에 박히므로 재빌드가 필요하다.

---

## 7. 점검 모드

Nginx는 `/opt/spotchzxk/maintenance.flag` 파일이 있으면 503을 반환하고 `documents/maintenance.html`을 서빙한다.

점검 시작:

```bash
touch /opt/spotchzxk/maintenance.flag
sudo systemctl reload nginx
```

점검 종료:

```bash
rm /opt/spotchzxk/maintenance.flag
sudo systemctl reload nginx
```

점검 중에도 백엔드는 켜둘 수 있다. 운영 DB 변경, 배포, 마이그레이션, 데이터 초기화 같은 작업에서는 점검 모드를 먼저 올리는 것이 안전하다.

점검 중 배포 흐름:

```text
1. maintenance.flag 생성
2. Nginx reload
3. git pull
4. frontend build 또는 backend bootJar
5. backend restart
6. 내부 health/API 확인
7. maintenance.flag 제거
8. Nginx reload
```

---

## 8. Nginx와 Cloudflare 세부 포인트

### Reverse proxy

Nginx는 SPA 정적 파일과 백엔드 proxy를 함께 처리한다.

| location | 처리 |
| --- | --- |
| `/` | `frontend/dist` 정적 파일, SPA fallback |
| `/api/` | `http://localhost:8080` proxy |
| `/ws` | WebSocket upgrade 포함 `http://localhost:8080` proxy |

WebSocket proxy에는 아래 설정이 필요하다.

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 86400;
```

### 실제 client IP

Cloudflare 뒤에 있으면 서버가 보는 원격 IP가 Cloudflare proxy IP가 된다. 게스트 abuse protection은 IP를 사용하므로 Nginx에서 Cloudflare IP range를 신뢰하고 `CF-Connecting-IP`를 실제 client IP로 복원해야 한다.

관련 설정은 이 문서의 Nginx/Cloudflare 섹션을 기준으로 관리한다.

### 봇 라우팅

SEO 강화를 위해 검색/메신저 봇이 `/`로 접근할 때 SPA 대신 `/og/home`을 반환할 수 있다.

적용 후보:

```text
Googlebot, Bingbot, DuckDuckBot, Facebook, Twitter, KakaoTalk, Discord 등
  -> /og/home
일반 사용자
  -> /index.html
```

봇 라우팅을 적용할 때는 운영 Nginx 설정에서 봇 user-agent를 분기해 `/og/home`으로 프록시한다.

---

## 9. 데이터와 DB 운영 원칙

### Flyway

Flyway migration은 `backend/src/main/resources/db/migration/`에 둔다.

원칙:

- 이미 운영 DB에 적용된 migration 파일은 수정하지 않는다.
- 스키마 변경은 새 `V{n}__description.sql` 파일을 추가한다.
- 운영 적용 전 DB 백업을 만든다.
- 큰 데이터 보정 migration은 스테이징/복제 DB에서 먼저 리허설한다.

`V13__repair_listed_at_column.sql`은 `V11`이 있음에도 제거하면 안 된다. 특정 환경에서 `listed_at` 누락을 방어하기 위한 호환 migration이다.

### 숫자 타입

이 프로젝트는 가격 폭등, AMM reserve, 큰 자산 규모 때문에 숫자 타입이 중요하다.

| 영역 | 기준 |
| --- | --- |
| DB 가격 | `DECIMAL(65,6)` |
| DB reserve | `DECIMAL(65,0)` |
| Java 가격/잔고 | `BigDecimal` |
| Java reserve | `BigInteger` |
| Frontend reserve | JSON 문자열 수신 후 `bigint` 계산 |

JS `number`로 reserve를 직접 계산하면 큰 값에서 정밀도가 깨진다.

### 주요 데이터 초기화 주의

초기화 또는 정식 시즌 전환 작업에서는 아래 데이터를 구분해야 한다.

| 데이터 | 성격 |
| --- | --- |
| Google 연동 계정 | 보존 대상 |
| 게스트 계정 | 정책에 따라 초기화/제한 대상 |
| 사용자 잔고/보유량 | 시즌성 데이터 |
| 주문/거래 이력 | 시즌성 데이터 |
| 종목/AMM 풀 | 시즌성 시장 데이터 |
| 배당 로그 | 시즌성 데이터 |
| 베타 보상 대상 스냅샷 | 삭제 전 보존 필요 |

정식 출시 초기화 계획은 아래 시즌 전환 메모를 기준으로 하되, 실제 컬럼명과 현재 코드 정책을 반드시 재확인한다.

---

## 10. 인증과 계정 운영

현재 인증 기준:

```text
Firebase Auth
  -> Frontend gets ID token
  -> apiFetch Authorization: Bearer token
  -> Backend FirebaseTokenFilter verifies token
  -> Firebase UID becomes principal
```

계정 유형:

| 계정 | 현재 의미 |
| --- | --- |
| 익명 Firebase 사용자 | 게스트 로그인에 사용 |
| Google 사용자 | 종목 등록 등 일부 기능에 필요한 role |
| 게스트에서 Google 연결 | `link-google`, `upgrade-guest` 흐름으로 처리 |

운영 주의:

- 서버는 클라이언트 body의 `userId`를 신뢰하면 안 된다.
- 핵심 API는 인증 principal인 Firebase UID 기준으로 처리해야 한다.
- 게스트 생성 제한은 FingerprintJS + IP + Redis/precheck permit 흐름에 의존한다.
- Cloudflare/Nginx real client IP 설정이 잘못되면 게스트 제한이 과하게 걸리거나 무력화될 수 있다.

---

## 11. 실시간 통신 운영 포인트

프론트는 STOMP singleton을 사용하며 연결이 끊기면 3초 후 재연결한다. 재연결 시 등록된 subscription을 다시 건다.

주요 토픽:

| 토픽 | 의미 |
| --- | --- |
| `/topic/streamers` | 종목 목록/가격/라이브 상태 변경 |
| `/topic/prices/{channelId}` | 종목 가격 변경 |
| `/topic/trades` | 체결 이벤트 |
| `/topic/candles/{channelId}` | 캔들 갱신 |
| `/topic/dividends` | 전체 배당 이벤트 |
| `/topic/user-dividends/{userId}` | 개인 배당 이벤트 |
| `/topic/megaphone` | 확성기 |
| `/topic/online-count` | 접속자 수 |
| `/topic/rankings-reset` | 자정 랭킹 리셋 |
| `/topic/stock-split-notices` | 주식 분할 공지 |

운영 체크:

- Nginx `/ws` upgrade header가 빠지면 실시간 기능이 실패한다.
- Cloudflare Network에서 WebSockets가 켜져 있어야 한다.
- 실시간 이벤트가 누락되어도 프론트는 일부 데이터를 polling으로 보정한다.
- 그래도 체결/배당 직후 포트폴리오 불일치가 보이면 React Query invalidate와 백엔드 커밋 후 발행 타이밍을 확인한다.

---

## 12. 정식 출시/시즌 전환 메모

정식 출시 로드맵의 핵심은 “베타 경제를 그대로 가져가지 않는다”이다.

핵심 원칙:

- Google 연동 계정 목록은 보존한다.
- 계정 연동은 현재 Google/Firebase Auth 흐름을 유지하고, 네이버 계정 연동은 정식 출시 범위에서 제외한다.
- 게스트와 시즌성 시장 데이터는 초기화한다.
- 베타 보상 대상은 삭제 전에 스냅샷으로 남긴다.
- 정식 시즌 초기 자본은 1,000만 코인 기준으로 설계한다.
- 신규 상장은 새 AMM reserve tier로 시작한다.
- 신규 상장 매수 제한은 상장 후 24시간 유저별 200주, 상장 후 7일 유저별 누적 3,000주 기준으로 설계한다.
- 베타 자산 규모를 정식 경제로 직접 이전하지 않는다.

정식 초기화 전 체크:

```text
1. 운영 DB 백업
2. Google/보상 대상 스냅샷 생성
3. 스냅샷 샘플 검증
4. 초기화 SQL 리허설
5. AMM tier 코드 확인
6. reserve DECIMAL/BigInteger/BigInt 흐름 확인
7. 신규 상장 매수 제한 확인: 24시간 200주, 7일 3,000주
8. 사전 상장 후보 확정
9. 인증 정책 확인: Google 현행 유지, 네이버 연동 제외
10. 점검 모드 전환
11. 운영 DB 초기화
12. 초기 자본/보상 지급
13. 모니터링
```

실제 적용 시 현재 DB 컬럼, 백엔드 코드, 프론트 계산식을 다시 대조한다.

---

## 13. 알려진 문서/구현 차이

프로젝트가 빠르게 바뀌면서 일부 문서에는 과거 구조가 남아 있다.

| 항목 | 주의 |
| --- | --- |
| `README.md` | 예전 인메모리 flush, 관리자 패널, Firestore 중심 설명이 섞여 있다. 현재 구조는 백엔드/프론트 개요 문서를 우선한다. |
| 로컬 `documents/test/*.md` | 과거 메모, 계획, 점검 기록이 섞여 있을 수 있다. 원격 공식 문서로 간주하지 않는다. |

문서 최신성 우선순위:

```text
1. 실제 코드
2. BACKEND_OVERVIEW.md / FRONTEND_OVERVIEW.md
3. PROJECT_DETAILS.md
4. 세부 참고 문서
5. 로컬 보관용 과거 메모
```

---

## 14. 장애 대응 체크리스트

### 프론트가 열리지 않음

확인:

```bash
ls /opt/spotchzxk/frontend/dist
sudo nginx -t
sudo systemctl status nginx
curl -I http://localhost
```

원인 후보:

- `frontend/dist` 미생성
- Nginx root 경로 오류
- Cloudflare DNS/SSL 문제
- SPA fallback 설정 누락

### API 502

확인:

```bash
sudo systemctl status spotchzxk
sudo journalctl -u spotchzxk -n 100 --no-pager
curl http://localhost:8080/health
curl http://localhost:8080/api/stocks
```

원인 후보:

- Spring Boot service down
- DB 연결 실패
- Flyway 실패
- 포트 8080 충돌
- JAR 빌드 실패

### WebSocket 실패

확인:

```bash
sudo nginx -t
sudo journalctl -u spotchzxk -n 100 --no-pager
```

브라우저 개발자 도구에서 확인:

- `/ws` 요청 status
- SockJS fallback 요청
- CORS 오류
- Cloudflare WebSockets 설정

원인 후보:

- Nginx upgrade header 누락
- Cloudflare WebSockets off
- `VITE_WS_URL` 값 오류
- 백엔드 CORS origin 불일치

### 로그인/인증 실패

확인:

- Firebase client env 값
- Firebase Console에서 Google/Anonymous provider 활성화 여부
- 백엔드 `FIREBASE_SERVICE_ACCOUNT_PATH`
- 백엔드 로그의 Firebase initialization 오류
- 브라우저 localStorage의 `pendingGuestMerge`, `guest_soft_logged_out`

### 게스트 생성이 과하게 막힘

확인:

- Redis 연결
- `app.guest-abuse.*` 설정
- Cloudflare/Nginx real client IP 설정
- `X-Forwarded-For`가 사용자 조작값으로 전달되고 있지 않은지

### 거래/포트폴리오 불일치

확인:

- 백엔드 거래 로그
- `orders` status
- `user_shares` quantity
- `stocks.coin_reserve`, `stocks.share_reserve`
- 프론트 React Query cache invalidate 시점
- `/topic/trades`, `/topic/user-dividends/{uid}` 수신 여부

### Flyway 실패

확인:

```bash
sudo journalctl -u spotchzxk -n 200 --no-pager
mysql -u spotchzxk -p spotchzxk
SELECT * FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 10;
```

원칙:

- 운영에 적용된 migration 파일을 수정하지 않는다.
- 실패 migration은 원인 파악 후 새 migration으로 복구한다.
- 필요 시 백업에서 복구하거나 스테이징에서 복구 SQL을 검증한다.

---

## 15. 운영 전 점검 목록

배포 전:

- `npm run build` 성공
- `./gradlew test` 또는 최소 `./gradlew bootJar` 성공
- 새 Flyway migration 이름/순서 확인
- 환경변수 변경 여부 확인
- Firebase env/service account 확인
- Nginx `nginx -t` 통과

배포 후:

- `/health` 응답
- `/api/stocks` 응답
- 프론트 첫 화면 로드
- Google 로그인
- 게스트 로그인
- 종목 목록 실시간 갱신
- 주문 테스트 또는 최소 주문 폼 예상금액 확인
- WebSocket 연결
- 백엔드 로그 에러 확인

운영 DB 변경 전:

- 백업 완료
- 리허설 완료
- 되돌릴 방법 확인
- 점검 모드 준비
- 작업 후 검증 쿼리 준비

---

## 16. 문서 유지보수 원칙

코드 변경 시 함께 갱신할 문서:

| 변경 종류 | 갱신 문서 |
| --- | --- |
| 백엔드 패키지/API/도메인 변경 | `BACKEND_OVERVIEW.md` |
| 프론트 화면/hook/통신 구조 변경 | `FRONTEND_OVERVIEW.md` |
| 환경변수/배포/Nginx/systemd 변경 | `PROJECT_DETAILS.md` |
| 정식 출시 정책 변경 | `PROJECT_DETAILS.md` |
| Flyway 의도나 특수 복구 migration | `PROJECT_DETAILS.md` |
| 장애 분석/해결 내역 | `PROJECT_DETAILS.md` 또는 별도 이슈/PR 기록 |

문서를 업데이트할 때는 “현재 코드 기준인지”, “계획인지”, “과거 이력인지”를 반드시 표시한다. 이 구분이 없으면 운영 중 잘못된 문서를 기준으로 판단할 위험이 크다.
