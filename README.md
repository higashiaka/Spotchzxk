# Spotchzxk

> **Global Streamer Exchange** — 치지직(CHZZK) 스트리머를 주식처럼 매수/매도하는 실시간 모의 거래소

각 스트리머가 하나의 종목(주식)으로 표현되며, 실제 매매 수요/공급 볼륨에 따라 가격이 동적으로 변화하는 가상 자산 거래 게임입니다.

---

## 기술 스택

### 프론트엔드 (`frontend/`)
- React 19 + TypeScript 5 + Vite 8
- TailwindCSS 4
- TanStack React Query 5
- Firebase SDK 12

### 백엔드 (`backend/`)
- Node.js + Express 5 + TypeScript 5
- Firebase Admin SDK 13
- ts-node-dev 2

### 인프라
- **Firebase Firestore** — 실시간 데이터베이스
- **Firebase Authentication** — Google / 익명 로그인
- **Firebase Analytics** — 사용량 분석

---

## 아키텍처

```
[브라우저]
    |
    |-- onSnapshot --> [Firestore] (실시간 가격/포트폴리오 구독)
    |-- POST /trade --> [Express 백엔드 :3000]
                              |
                         [인메모리 주문 버퍼]
                              |
                    [3초 주기 매칭 엔진]
                              |
                    [Firestore 트랜잭션] (원자적 일괄 처리)
                       - 가격 업데이트
                       - 포트폴리오 업데이트
                       - 거래 내역 기록
```

**핵심 설계 원칙:**
- 주문 접수 시 DB에 즉시 쓰지 않고 서버 메모리 버퍼에 적재 → Firebase 쓰기 쿼터 절약
- 3초마다 전체 주문을 단일 Firestore 트랜잭션으로 처리 → 원자성 보장
- 프론트엔드 Optimistic UI로 즉시 반영 → 체감 응답성 향상

---

## 실행 방법

### 사전 준비

**백엔드:** Firebase 서비스 계정 키(JSON)를 발급받아 `backend/` 디렉토리에 배치하세요.

**프론트엔드:** `frontend/.env` 파일을 생성하고 Firebase 프로젝트 설정값을 입력하세요.

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

### 백엔드 실행

```bash
cd backend
npm install
npm run dev
```

### 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

> 프론트엔드는 `http://localhost:3000`으로 백엔드 API를 호출합니다.

---

## 주요 기능

### 인증
- **Google 로그인** / **익명 게스트** 모두 지원
- 비인증 상태에서도 마켓 보드 실시간 열람 가능
- 거래 및 포트폴리오 조회는 인증 필수

### 마켓 보드
- 약 160개 치지직 스트리머 종목 카드 목록
- 총 거래 볼륨 내림차순 정렬 (인기 종목 상위 노출)
- 이름 기준 실시간 검색 필터
- `onSnapshot`으로 가격 실시간 업데이트

### 종목 거래 화면
- 스파크라인 차트 (최근 20틱 SVG polyline)
- 가격 방향 표시: 상승(▲ 초록) / 하락(▼ 빨강)
- 수량 입력 시 예상 총 비용 자동 계산
- 잔액/보유량 부족 시 Buy/Sell 버튼 자동 비활성화

### 포트폴리오
- 보유 현금(Treasury Cash) 및 보유 종목(Vault Assets) 표시
- 종목 클릭 시 해당 거래 화면으로 이동

### 거래 내역
- 최근 15건, 4초 자동 폴링 갱신
- 체결 유형, 수량, 종목명, 체결가, 상태 표시

---

## 가격 결정 알고리즘

```
netVolume      = (사이클 내 매수량) - (사이클 내 매도량)
priceMultiplier = 1 + (netVolume × 0.0005)
newPrice       = max(0.01, currentPrice × priceMultiplier)
```

- 순매수 우세 → 가격 상승 / 순매도 우세 → 가격 하락
- 최저가 하한선: **$0.01**

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
├── backend/
│   ├── index.ts          # Express 서버 진입점
│   ├── engine.ts         # 사이클 매칭 엔진 + 주문 접수 핸들러
│   ├── firebase.ts       # Firebase Admin SDK 초기화
│   └── package.json
├── frontend/
│   └── src/
│       ├── App.tsx                        # 메인 UI (마켓 보드, 거래 화면)
│       ├── firebase.ts                    # Firebase 클라이언트 초기화
│       └── hooks/
│           ├── useStreamers.ts            # 전체 종목 목록 실시간 구독
│           ├── useStreamerPrice.ts         # 개별 종목 가격 실시간 구독
│           ├── useTrade.ts                # 매수/매도 뮤테이션 (Optimistic UI)
│           ├── usePortfolio.ts            # 포트폴리오 조회
│           └── useTransactionHistory.ts   # 거래 내역 조회 (폴링)
└── firestore.rules                        # Firestore 보안 규칙
```

---

## Firestore 보안 규칙

| 컬렉션 | 읽기 | 쓰기 |
|--------|------|------|
| `streamers/*` | 누구나 가능 | 불가 (백엔드만) |
| `portfolios/{userId}` | 본인만 가능 | 불가 (백엔드만) |
| `portfolios/{userId}/orders/*` | 본인만 가능 | 본인이 create만 가능 |

주문 생성은 백엔드 HTTP 엔드포인트(`POST /trade`)를 통해서만 처리됩니다.
