# Spotchzxk - 프로젝트 명세서

## 1. 프로젝트 개요

**Spotchzxk**는 치지직(CHZZK) 스트리머를 주식처럼 매수/매도하는 실시간 모의 거래소 웹 애플리케이션이다.

- 슬로건: *Global Streamer Exchange*
- 각 스트리머는 하나의 종목(주식)으로 표현된다.
- 가격은 실제 매매 수요/공급 볼륨에 따라 동적으로 변화한다.
- 실제 화폐가 오가지 않는 가상 자산 거래 게임이다.

---

## 2. 기술 스택

### 프론트엔드 (`frontend/`)
| 항목 | 버전 |
|------|------|
| React | 19.x |
| TypeScript | 5.x |
| Vite | 8.x |
| TailwindCSS | 4.x |
| TanStack React Query | 5.x |
| Firebase SDK | 12.x |

### 백엔드 (`backend/`)
| 항목 | 버전 |
|------|------|
| Node.js + Express | 5.x |
| TypeScript | 5.x |
| Firebase Admin SDK | 13.x |
| ts-node-dev | 2.x |

### 인프라
- **Firebase Firestore** - 실시간 데이터베이스
- **Firebase Authentication** - 사용자 인증 (Google / 익명)
- **Firebase Analytics** - 사용량 분석

---

## 3. 시스템 아키텍처

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

### 핵심 설계 원칙
- 주문 접수 시 즉시 DB에 쓰지 않고 서버 메모리 버퍼에만 적재 → **Firebase 쓰기 쿼터 절약**
- 3초마다 한 번에 전체 주문을 단일 Firestore 트랜잭션으로 처리 → **원자성 보장**
- 프론트엔드는 Optimistic UI로 즉시 UI 반영 → **체감 응답성 향상**

---

## 4. 기능 명세

### 4.1 인증

| 방식 | 설명 |
|------|------|
| Google 로그인 | Firebase `signInWithPopup` + GoogleAuthProvider |
| 익명 게스트 | Firebase `signInAnonymously` |
| 비인증 관람 | 거래 불가, 마켓 보드만 열람 가능 |

- 로그인 없이도 시장 가격 실시간 열람 가능
- 거래, 포트폴리오 조회, 거래 내역 조회는 인증 필수

### 4.2 마켓 보드

- 전체 스트리머 종목 카드 목록
- 이름 기준 실시간 검색 필터
- **총 거래 볼륨 내림차순** 정렬 (인기 종목 상위 노출)
- 각 카드: 종목명, 현재가, 총 수요 볼륨, Trade 버튼
- 가격 실시간 업데이트 (`onSnapshot`)

### 4.3 종목 거래 화면

- 진입 시 해당 스트리머의 개별 가격 구독 시작
- **스파크라인 차트**: 최근 20틱 가격 이력 (SVG polyline)
- 가격 방향 표시: 상승(▲ 초록), 하락(▼ 빨강)
- 총 수요 볼륨 / 내 보유량(SA) 표시
- 수량 입력 → 예상 총 비용 자동 계산
- Buy / Sell 버튼 (잔액/보유량 부족 시 비활성화)

### 4.4 포트폴리오 (좌측 사이드바)

- 사용 가능한 달러 잔액 (Treasury Cash)
- 보유 중인 SA 목록 (Vault Assets)
  - 종목명, 현재 단가, 보유 수량, 평가금액
  - 클릭 시 해당 종목 거래 화면으로 이동

### 4.5 거래 내역

- 최근 15건, 타임스탬프 내림차순
- 4초마다 자동 폴링 갱신
- 표시 정보: 매수/매도 유형, 수량, 종목명, 체결가, 상태

---

## 5. 백엔드 매칭 엔진

### 5.1 주문 접수 (`POST /trade`)

```
Request Body:
{
  userId: string
  streamerId: string
  type: 'buy' | 'sell'
  quantity: number
  estimatedPrice: number
}

Response:
{ status: 'queued' }
```

- 유효성 검사 후 인메모리 `pendingOrders` 배열에 push
- DB 쓰기 없음

### 5.2 사이클 처리 (3초 주기)

매 사이클마다 다음을 단일 Firestore 트랜잭션으로 처리:

1. **스트리머 현재가 조회** - 관련 종목 일괄 fetch
2. **포트폴리오 조회** - 관련 사용자 일괄 fetch
3. **주문 유효성 검사 및 처리**
   - Buy: 잔액 < 비용이면 주문 스킵
   - Sell: 보유량 < 수량이면 주문 스킵
   - 유효한 주문은 포트폴리오(잔액, 보유량)에 반영
4. **가격 재계산** (아래 참고)
5. **Firestore 포트폴리오 업데이트**
6. **거래 내역 기록** (`portfolios/{userId}/orders/{orderId}`)

### 5.3 가격 결정 알고리즘

```
netVolume = (사이클 내 매수량 합계) - (사이클 내 매도량 합계)
priceMultiplier = 1 + (netVolume × 0.0005)
newPrice = max(0.01, currentPrice × priceMultiplier)
```

- 순매수 우세 → 가격 상승
- 순매도 우세 → 가격 하락
- 최저가 $0.01 하한선
- `totalVolume`은 매수+매도 총량을 누적

---

## 6. Firestore 데이터 모델

### `streamers/{streamerId}`
```
{
  price: number          // 현재 종목 단가
  totalVolume: number    // 누적 총 거래 볼륨
  name?: string          // (DB에만 있는 신규 종목의 경우)
}
```

### `portfolios/{userId}`
```
{
  balance: number               // 보유 현금
  shares: {
    [streamerId]: number        // 보유 SA 수량
  }
}
```

### `portfolios/{userId}/orders/{orderId}`
```
{
  userId: string
  streamerId: string
  type: 'buy' | 'sell'
  quantity: number
  estimatedPrice: number
  executedPrice: number         // 실제 체결 단가
  timestamp: number             // Unix ms
  status: 'completed'
}
```

---

## 7. Firestore 보안 규칙

| 컬렉션 | 읽기 | 쓰기 |
|--------|------|------|
| `streamers/*` | 누구나 가능 | 불가 (백엔드만) |
| `portfolios/{userId}` | 본인만 가능 | 불가 (백엔드만) |
| `portfolios/{userId}/orders/*` | 본인만 가능 | 본인이 create만 가능 |

주문 생성은 클라이언트에서 직접 Firestore에 쓰지 않고 백엔드 HTTP 엔드포인트를 통해서만 처리된다.

---

## 8. 종목 목록

총 **약 160개**의 치지직 스트리머 종목이 등록되어 있다.
프론트엔드에 하드코딩된 기본 목록(`DEFAULT_STREAMERS`)이 존재하며, Firestore에 신규 추가된 종목이 있으면 동적으로 병합된다.

주요 종목 카테고리:
- **LCK 팀 선수**: HLE (Delight, Gumayusi, Kanavi, Zeka, Zeus), 농심 레드포스, 브리온 등
- **인터넷 방송인**: 침착맨, 풍월량, 따효니, 양띵 등 다수
- **버튜버(VTuber)**: 아라하시 타비, 네네코 마시로, 유즈하 리코, 아야츠노 유니 등 (니지산지 KR 소속)

모든 종목의 초기 가격은 **$100**, 초기 볼륨은 **0**이다.

---

## 9. 사용자 초기 상태

| 항목 | 초기값 |
|------|--------|
| 잔액 | $10,000 |
| 보유 주식 | 없음 |

최초 로그인 시 포트폴리오 문서가 없으면 프론트엔드(`usePortfolio`)에서 초기 포트폴리오를 Firestore에 자동 생성한다.

---

## 10. 환경 변수

### 프론트엔드 (`.env`)
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

### 백엔드 (`.env`)
```
PORT                        # 기본값: 3000
```
Firebase Admin SDK는 서비스 계정 키(JSON)를 통해 인증한다.

---

## 11. 실행 방법

### 백엔드
```bash
cd backend
npm install
npm run dev      # ts-node-dev index.ts
```

### 프론트엔드
```bash
cd frontend
npm install
npm run dev      # vite
```

프론트엔드는 `http://localhost:3000`으로 백엔드 API를 호출한다 (하드코딩).

---

## 12. 주요 파일 구조

```
Spotchzxk/
├── backend/
│   ├── index.ts          # Express 서버 진입점
│   ├── engine.ts         # 사이클 매칭 엔진 + 주문 접수 핸들러
│   ├── firebase.ts       # Firebase Admin SDK 초기화
│   └── package.json
├── frontend/
│   └── src/
│       ├── App.tsx                          # 메인 UI (마켓 보드, 거래 화면)
│       ├── firebase.ts                      # Firebase 클라이언트 초기화
│       └── hooks/
│           ├── useStreamers.ts              # 전체 종목 목록 실시간 구독
│           ├── useStreamerPrice.ts           # 개별 종목 가격 실시간 구독
│           ├── useTrade.ts                  # 매수/매도 뮤테이션 (Optimistic UI)
│           ├── usePortfolio.ts              # 포트폴리오 조회
│           └── useTransactionHistory.ts     # 거래 내역 조회 (폴링)
└── firestore.rules                          # Firestore 보안 규칙
```
