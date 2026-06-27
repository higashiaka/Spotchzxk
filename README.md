# Spotchzxk

**Spotchzxk**는 치지직(CHZZK) 스트리머를 종목처럼 등록하고, 사용자가 가상 원화로 매수·매도하는 실시간 모의 주식 거래소입니다.

스트리머 한 명이 하나의 종목이 되고, 가격은 AMM 풀 기반으로 움직입니다. 사용자는 종목 시세를 확인하고, 시장가/지정가 주문을 넣고, 라이브 중인 스트리머 종목의 배당과 랭킹, 확성기, 보유 자산을 실시간으로 확인할 수 있습니다.

---

## 주요 기능

- 치지직 채널 기반 종목 등록 및 시세 조회
- CPAMM(Constant Product AMM) 기반 시장가 체결
- 시장가/지정가 주문, 미체결 주문 취소
- Firebase Google 로그인 및 익명 게스트 로그인
- 게스트 abuse protection을 위한 FingerprintJS + 서버 precheck
- 포트폴리오, 평균단가, 실현손익, 배당/후원 누적 관리
- 현재 라이브 세션의 배당 기준 수량 기준 1시간 단위 배당
- 고가 종목 10:1 주식 분할
- STOMP WebSocket 기반 실시간 가격, 체결, 배당, 확성기, 접속자 수 반영
- React Query 기반 서버 상태 캐시와 주문 낙관적 업데이트
- 데스크톱/모바일 반응형 UI와 모바일 탭 스와이프
- OCI VM + Nginx + systemd + MySQL 운영 배포 문서화

---

## 프로젝트 구조

```text
Spotchzxk/
├── backend/                  # Spring Boot API, 거래 엔진, DB/Flyway, WebSocket
├── frontend/                 # React/Vite SPA
├── documents/
│   ├── BACKEND_OVERVIEW.md   # 백엔드 상세 구조 설명서
│   ├── FRONTEND_OVERVIEW.md  # 프론트엔드 상세 구조 설명서
│   ├── PROJECT_DETAILS.md    # 운영/배포/환경변수/장애 대응 세부 정보
│   └── ...
└── README.md
```

상세 구조는 아래 문서를 기준으로 확인하세요.

| 문서 | 내용 |
| --- | --- |
| [BACKEND_OVERVIEW.md](documents/BACKEND_OVERVIEW.md) | 백엔드 패키지, 도메인 모델, 거래/배당/분할/API/스케줄러 |
| [FRONTEND_OVERVIEW.md](documents/FRONTEND_OVERVIEW.md) | 프론트엔드 화면 구조, 인증, React Query, STOMP, 주문 UI |
| [PROJECT_DETAILS.md](documents/PROJECT_DETAILS.md) | 환경변수, 로컬 실행, 배포, DB 운영, 점검, 장애 대응 |

---

## 기술 스택

### Frontend

- React 19
- TypeScript 5
- Vite 8
- Tailwind CSS 4
- TanStack React Query 5
- Firebase SDK
- STOMP.js + SockJS
- lightweight-charts
- FingerprintJS

### Backend

- Java 17
- Spring Boot 3.5
- Spring Data JPA / Hibernate
- Spring Security
- Spring WebSocket + STOMP
- Firebase Admin SDK
- MySQL
- Redis
- Flyway
- Gradle

### Infra

- OCI VM
- Nginx
- systemd
- Cloudflare
- MySQL
- Redis

---

## 아키텍처 개요

```text
Browser
  -> React/Vite SPA
  -> Firebase Auth
  -> REST API /api/*
  -> STOMP WebSocket /ws
  -> Spring Boot Backend
  -> MySQL + Flyway
  -> Redis
  -> Chzzk OpenAPI
```

운영 배포에서는 Nginx가 `frontend/dist` 정적 파일을 서빙하고, `/api/*`와 `/ws`를 Spring Boot 백엔드로 프록시합니다.

```text
User
  -> Cloudflare HTTPS
  -> Nginx
     -> frontend/dist
     -> /api/* -> localhost:8080
     -> /ws    -> localhost:8080
  -> Spring Boot
  -> MySQL / Redis
```

---

## 핵심 도메인

| 개념 | 설명 |
| --- | --- |
| User | Firebase UID 기반 사용자. 잔고, 닉네임, 티켓, 랭킹 누적값을 가진다. |
| Stock | 치지직 채널 하나를 거래 가능한 종목으로 만든 데이터. |
| Order | 시장가/지정가 매수·매도 주문 기록. |
| UserShare | 사용자별 종목 보유량, 평균단가, 배당 기준 수량. |
| AMM Pool | `coinReserve`와 `shareReserve`로 가격을 산출하는 유동성 풀. |
| Dividend | 라이브 중인 종목의 현재 라이브 세션 배당 기준 수량 기준 배당. |
| Stock Split | 1,000,000원 초과 고가 종목을 10:1로 나누는 가격 안정 장치. |

거래 가격은 CPAMM 모델을 사용합니다.

```text
coinReserve * shareReserve = k
currentPrice = coinReserve / shareReserve
```

매수하면 `coinReserve`가 증가하고 `shareReserve`가 감소해 가격이 오릅니다. 매도하면 반대로 가격이 내려갑니다.

---

## 사전 준비

로컬 개발에는 다음이 필요합니다.

- Java 17
- Node.js 20 이상 권장
- MySQL 8
- Redis
- Firebase project
- Firebase service account JSON

Firebase Authentication에서 Google 로그인과 Anonymous 로그인을 활성화해야 합니다.

---

## Backend 설정

`backend/.env` 파일을 생성합니다.

```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_NAME=spotchzxk
DB_USERNAME=root
DB_PASSWORD=

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

PORT=8080
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
ADMIN_API_KEY=local-admin-key
FIREBASE_SERVICE_ACCOUNT_PATH=serviceAccountKey.json

GUEST_ABUSE_ENABLED=true
GUEST_ABUSE_WINDOW_SECONDS=300
GUEST_ABUSE_MAX_NEW_GUESTS_PER_WINDOW=3
GUEST_ABUSE_BLOCK_SECONDS=300
```

Firebase service account 파일은 예를 들어 아래 위치에 둡니다.

```text
backend/serviceAccountKey.json
```

MySQL database 예시:

```sql
CREATE DATABASE spotchzxk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

애플리케이션 시작 시 Flyway가 `backend/src/main/resources/db/migration/`의 migration을 적용합니다.

---

## Frontend 설정

`frontend/.env` 파일을 생성합니다.

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=http://localhost:8080/ws
```

프론트엔드 환경변수는 빌드 타임에 반영됩니다. 값을 바꾸면 프론트엔드를 다시 빌드해야 합니다.

---

## Installation

루트에서 각각 백엔드와 프론트엔드를 준비합니다.

### Backend

```bash
cd backend
./gradlew bootJar
```

Windows:

```powershell
cd backend
.\gradlew.bat bootJar
```

### Frontend

```bash
cd frontend
npm install
```

---

## Run Locally

### 1. Backend 실행

```bash
cd backend
./gradlew bootRun
```

Windows:

```powershell
cd backend
.\gradlew.bat bootRun
```

백엔드 기본 주소:

```text
http://localhost:8080
```

확인:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/api/stocks
```

### 2. Frontend 실행

```bash
cd frontend
npm run dev
```

프론트엔드 기본 주소:

```text
http://localhost:5173
```

---

## Build

### Backend

```bash
cd backend
./gradlew bootJar
```

테스트 포함:

```bash
cd backend
./gradlew test
```

### Frontend

```bash
cd frontend
npm run build
```

빌드 결과:

```text
frontend/dist/
```

Preview:

```bash
cd frontend
npm run preview
```

Lint:

```bash
cd frontend
npm run lint
```

---

## 주요 API

| Method | Path | 설명 |
| --- | --- | --- |
| `GET` | `/health` | 백엔드 헬스체크 |
| `GET` | `/api/stocks` | 전체 종목 목록 |
| `POST` | `/api/stocks` | 종목 등록 |
| `GET` | `/api/stocks/{id}/candles` | 종목 OHLC 캔들 |
| `GET` | `/api/stocks/{id}/order-book` | 호가창 |
| `POST` | `/api/trade` | 주문 제출 |
| `POST` | `/api/trade/cancel` | 미체결 주문 취소 |
| `GET` | `/api/portfolio` | 내 포트폴리오 |
| `GET` | `/api/orders` | 내 주문 이력 |
| `GET` | `/api/rankings` | 랭킹 |
| `GET` | `/api/dividends/recent` | 최근 배당 이벤트 |
| `POST` | `/api/shop/megaphone` | 확성기 사용 |

자세한 API와 인증 정책은 [BACKEND_OVERVIEW.md](documents/BACKEND_OVERVIEW.md)를 참고하세요.

---

## WebSocket Topics

SockJS endpoint:

```text
/ws
```

주요 STOMP topic:

| Topic | 설명 |
| --- | --- |
| `/topic/streamers` | 종목 목록, 라이브 상태, 일일 리셋, 분할 갱신 |
| `/topic/prices/{channelId}` | 종목별 가격 갱신 |
| `/topic/trades` | 체결 이벤트 |
| `/topic/candles/{channelId}` | 캔들 갱신 |
| `/topic/dividends` | 전체 배당 이벤트 |
| `/topic/user-dividends/{userId}` | 개인 배당 알림 |
| `/topic/megaphone` | 확성기 글 |
| `/topic/online-count` | 접속자 수 |
| `/topic/stock-split-notices` | 주식 분할 공지 |

프론트엔드는 STOMP singleton을 사용해 재연결 시 구독을 자동 복구합니다.

---

## Deployment

운영 배포는 OCI VM 기준으로 문서화되어 있습니다.

요약:

```text
1. OCI VM 준비
2. Java, Node.js, MySQL, Redis, Nginx 설치
3. 프로젝트 clone
4. backend/.env와 Firebase service account 설정
5. frontend/.env 설정
6. frontend npm run build
7. backend ./gradlew bootJar
8. systemd service 등록
9. Nginx reverse proxy 설정
10. Cloudflare DNS/HTTPS/WebSocket 설정
```

운영 환경변수, 점검 모드, 배포 패턴, 장애 대응은 [PROJECT_DETAILS.md](documents/PROJECT_DETAILS.md)에 정리되어 있습니다.

---

## Maintenance Mode

운영 Nginx 설정은 `maintenance.flag` 파일로 점검 모드를 켤 수 있도록 구성할 수 있습니다.

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

점검 페이지는 [maintenance.html](documents/maintenance.html)을 사용합니다.

---

## 참고 문서

| 문서 | 설명 |
| --- | --- |
| [BACKEND_OVERVIEW.md](documents/BACKEND_OVERVIEW.md) | 백엔드 전체 동작 설명 |
| [FRONTEND_OVERVIEW.md](documents/FRONTEND_OVERVIEW.md) | 프론트엔드 전체 동작 설명 |
| [PROJECT_DETAILS.md](documents/PROJECT_DETAILS.md) | 운영/배포/환경변수/장애 대응 |

---

## 주의 사항

- 이미 운영 DB에 적용된 Flyway migration 파일은 수정하지 말고 새 migration을 추가하세요.
- 핵심 API는 클라이언트가 보낸 `userId`가 아니라 Firebase 인증 principal을 기준으로 동작해야 합니다.
- AMM reserve와 큰 금액은 정밀도 문제가 있으므로 백엔드는 `BigDecimal`/`BigInteger`, 프론트는 필요한 곳에서 `bigint`를 사용합니다.
- 프론트엔드 환경변수는 빌드 타임에 반영됩니다.
- WebSocket 운영 시 Nginx upgrade header와 Cloudflare WebSockets 설정을 확인하세요.
- README는 프로젝트 진입점이고, 최신 세부 구현은 `documents/`의 상세 문서를 우선합니다.
