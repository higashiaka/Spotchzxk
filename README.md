# Spotchzxk

> **Global Streamer Exchange** — 치지직(CHZZK) 스트리머를 주식처럼 매수/매도하는 실시간 모의 거래소

각 스트리머가 하나의 종목(주식)으로 표현되며, 실제 매매 수요/공급 볼륨에 따라 가격이 동적으로 변화하는 가상 자산 거래 게임입니다.

---

## 기술 스택

### 프론트엔드 (`frontend/`)
- React 19 + TypeScript 5 + Vite 8
- TailwindCSS 4
- TanStack React Query 5
- STOMP.js 7 + SockJS (실시간 WebSocket)
- Firebase SDK 12
- FingerprintJS 5 (게스트 디바이스 식별)

### 백엔드 (`backend/`)
- Java 17 + Spring Boot 3.5
- Spring Data JPA + MySQL (Flyway 마이그레이션)
- Spring WebSocket (STOMP 브로커)
- Spring Security + Firebase Admin SDK 9 (토큰 인증)
- Lombok, Gradle

### 인프라
- **MySQL** — 포트폴리오·주문 영속 스토리지
- **Firebase Authentication** — Google / 익명 / 게스트 커스텀 토큰 로그인
- **Firebase Firestore** — 스트리머 메타데이터 (관리자 패널 경유)
- **Firebase Analytics** — 사용량 분석

---

## 아키텍처

```
[브라우저]
    |
    |-- STOMP /topic/prices/{id} --> [Spring WebSocket 브로커] (실시간 가격 구독)
    |-- STOMP /topic/streamers   --> [Spring WebSocket 브로커] (종목 목록 구독)
    |-- POST /api/trade          --> [Spring 백엔드 :8080]
                                          |
                                   [인메모리 주문 버퍼]
                                   (ConcurrentHashMap + LinkedBlockingQueue)
                                          |
                              [3초 주기 @Scheduled flush()]
                                          |
                              [@Transactional MySQL 일괄 처리]
                               - 포트폴리오 업데이트
                               - 주문 기록 저장
                               - 스트리머 가격 업데이트
                                          |
                              [STOMP 브로드캐스트] (트랜잭션 외부)
```

**핵심 설계 원칙:**
- 거래 요청 즉시 인메모리 캐시에서 처리 → DB 쓰기 없이 즉각 응답
- 3초마다 dirty 포트폴리오·종목을 단일 트랜잭션으로 MySQL에 플러시 → 원자성 보장
- 플러시 성공 후 STOMP `/topic/*`으로 브로드캐스트 → 모든 클라이언트 동시 갱신
- 프론트엔드 Optimistic UI로 즉시 반영 → 체감 응답성 향상

---

## 실행 방법

### 사전 준비

**백엔드:** Firebase 서비스 계정 키(JSON)를 발급받아 `backend/` 디렉토리에 배치하고, `.env` 파일을 생성하세요.

```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=spotchzxk
DB_USERNAME=root
DB_PASSWORD=
FIREBASE_SERVICE_ACCOUNT_PATH=serviceAccountKey.json
CORS_ORIGIN=http://localhost:5173
ADMIN_API_KEY=
```

**프론트엔드:** `frontend/.env` 파일을 생성하고 Firebase 프로젝트 설정값을 입력하세요.

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=http://localhost:8080/ws
```

### 백엔드 실행

```bash
cd backend
./gradlew bootRun
```

> Windows에서는 `gradlew.bat bootRun`

### 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

> 프론트엔드는 `http://localhost:8080`으로 백엔드 REST API를 호출하고, `http://localhost:8080/ws`로 STOMP WebSocket에 연결합니다.

---

## 주요 기능

### 인증
- **Google 로그인** / **익명 게스트** 모두 지원
- 게스트는 FingerprintJS 디바이스 ID로 세션 유지 (커스텀 Firebase 토큰 발급)
- 비인증 상태에서도 마켓 보드 실시간 열람 가능
- 거래 및 포트폴리오 조회는 인증 필수

### 마켓 보드
- 약 160개 치지직 스트리머 종목 카드 목록
- 총 거래 볼륨 내림차순 정렬 (인기 종목 상위 노출)
- 이름 기준 실시간 검색 필터
- STOMP `/topic/streamers` 구독으로 가격 실시간 업데이트

### 종목 거래 화면
- 스파크라인 차트 (최근 20틱 SVG polyline)
- STOMP `/topic/prices/{streamerId}` 구독으로 개별 가격 실시간 수신
- 가격 방향 표시: 상승(▲ 초록) / 하락(▼ 빨강)
- 수량 입력 시 예상 총 비용 자동 계산
- 잔액/보유량 부족 시 Buy/Sell 버튼 자동 비활성화

### 포트폴리오
- 보유 현금(Treasury Cash) 및 보유 종목(Vault Assets) 표시
- `GET /api/portfolio` REST 폴링 (React Query)

### 거래 내역
- 최근 주문 목록, 4초 자동 폴링 갱신 (`GET /api/orders`)
- 체결 유형, 수량, 종목명, 체결가, 상태 표시

### 관리자 패널
- Google 로그인 + 관리자 권한 확인 (`GET /api/admin/me`)
- 스트리머 종목 추가·편집·초기화 (Firestore 직접 기록)
- 관리자 권한 부여·회수 (`/api/admin/permissions`)

---

## 가격 결정 알고리즘

```
netDelta       = isBuy ? +qty : -qty
multiplier     = 1 + (netDelta × 0.0005)
executedPrice  = max(0.01, currentPrice × multiplier)
```

- 순매수 우세 → 가격 상승 / 순매도 우세 → 가격 하락
- 가격은 거래 즉시 인메모리 캐시에 반영되고, 3초 후 MySQL에 영속화
- 최저가 하한선: **$0.01**
- KST 자정(00:00) 일일 거래량 자동 리셋

---

## 사용자 초기 상태

| 항목 | 초기값 |
|------|--------|
| 잔액 | $10,000 |
| 보유 주식 | 없음 |
| 종목 초기가 | $100 |

---

## 프로젝트 구조

```
Spotchzxk/
├── backend/                          # Java 17 + Spring Boot 3.5
│   └── src/main/java/com/spotchzxk/
│       ├── SpotchzxkApplication.java
│       ├── config/
│       │   ├── FirebaseConfig.java   # Firebase Admin SDK 초기화
│       │   ├── SecurityConfig.java   # Spring Security 설정
│       │   └── WebSocketConfig.java  # STOMP 브로커 설정
│       ├── controller/
│       │   ├── TradeController.java  # POST /api/trade
│       │   ├── PortfolioController.java # GET /api/portfolio, /api/orders
│       │   ├── GuestController.java  # POST /api/guest/register
│       │   └── AdminController.java  # /api/admin/*
│       ├── service/
│       │   ├── TradeEngine.java      # 인메모리 캐시 + 3초 flush + STOMP 브로드캐스트
│       │   ├── PortfolioService.java
│       │   ├── StreamerService.java
│       │   └── GuestService.java     # FingerprintJS 기반 커스텀 토큰 발급
│       ├── entity/                   # JPA 엔티티 (Streamer, Portfolio, Order, ...)
│       ├── repository/               # Spring Data JPA 리포지토리
│       ├── dto/                      # TradeRequest/Response, GuestRegisterRequest
│       └── security/
│           └── FirebaseTokenFilter.java # Authorization: Bearer 검증
├── frontend/
│   └── src/
│       ├── App.tsx                   # 메인 UI (마켓 보드, 거래 화면)
│       ├── firebase.ts               # Firebase 클라이언트 초기화
│       ├── data/
│       │   └── streamers.ts         # 로컬 스트리머 초기 데이터
│       ├── lib/
│       │   ├── api.ts               # apiFetch (Firebase 토큰 헤더 주입)
│       │   └── stompClient.ts       # STOMP 클라이언트 싱글톤
│       ├── hooks/
│       │   ├── useStreamers.ts      # /topic/streamers STOMP 구독
│       │   ├── useStreamerPrice.ts  # /topic/prices/{id} STOMP 구독
│       │   ├── useTrade.ts          # POST /api/trade (Optimistic UI)
│       │   ├── usePortfolio.ts      # GET /api/portfolio (React Query)
│       │   ├── useTransactionHistory.ts # GET /api/orders (4초 폴링)
│       │   └── useIsAdmin.ts        # GET /api/admin/me
│       └── pages/
│           ├── AdminPage.tsx
│           └── AdminPermissionsPage.tsx
└── firestore.rules                   # Firestore 보안 규칙 (스트리머 메타데이터)
```

---

## API 엔드포인트

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| `POST` | `/api/trade` | 필수 | 매수/매도 주문 접수 |
| `GET` | `/api/portfolio` | 필수 | 포트폴리오 조회 |
| `GET` | `/api/orders` | 필수 | 주문 내역 조회 |
| `POST` | `/api/guest/register` | 불필요 | 게스트 커스텀 토큰 발급 |
| `GET` | `/api/admin/me` | 필수 | 관리자 여부 확인 |
| `GET/POST` | `/api/admin/permissions` | 관리자 | 관리자 권한 관리 |
| `WS` | `/ws` (SockJS) | — | STOMP WebSocket 엔드포인트 |

---

## Firestore 보안 규칙

| 컬렉션 | 읽기 | 쓰기 |
|--------|------|------|
| `streamers/*` | 누구나 가능 | 불가 (관리자 패널 경유) |
| `portfolios/{userId}` | 본인만 가능 | 불가 (백엔드만) |

포트폴리오·주문 데이터는 MySQL에 저장됩니다. Firestore는 스트리머 메타데이터 관리에만 사용됩니다.
