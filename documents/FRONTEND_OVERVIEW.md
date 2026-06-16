# Spotchzxk 프론트엔드 구조 상세 설명서

작성일: 2026-06-16 / 최종 업데이트: 2026-06-16  
기준 코드: `frontend/src`

---

## 1. 한눈에 보는 프론트엔드

Spotchzxk 프론트엔드는 치지직 스트리머 모의 주식 거래소의 웹 클라이언트다. 사용자는 이 앱에서 종목 시세를 보고, 매수/매도 주문을 넣고, 보유 자산과 랭킹을 확인하며, 라이브 배당/확성기/실시간 체결 정보를 확인한다.

프론트엔드는 다음 역할을 맡는다.

- Firebase Auth로 Google 로그인과 게스트 로그인을 처리한다.
- 백엔드 REST API에서 종목, 포트폴리오, 주문, 배당, 랭킹, 상점 데이터를 가져온다.
- STOMP WebSocket으로 가격, 체결, 배당, 확성기, 접속자 수를 실시간 반영한다.
- React Query로 서버 데이터를 캐싱하고, 거래/상점/주문 취소 후 관련 캐시를 무효화한다.
- AMM reserve를 이용해 주문 전 예상 체결금액과 수수료를 클라이언트에서 계산해 보여준다.
- 데스크톱과 모바일 레이아웃을 분리하고, 모바일에서는 주요 탭을 좌우 스와이프로 이동한다.

**Tech Stack**

| 구분 | 내용 |
| --- | --- |
| Language | TypeScript |
| Framework | React 19 |
| Build Tool | Vite 8 |
| Styling | Tailwind CSS 4 + CSS custom properties |
| Server State | TanStack React Query 5 |
| Auth | Firebase Auth |
| Realtime | STOMP + SockJS |
| Chart | lightweight-charts |
| Fingerprint | FingerprintJS |

---

## 2. 핵심 사용자 경험

앱은 탭 기반 거래소 화면이다.

| 화면 | 사용자가 하는 일 |
| --- | --- |
| 홈 | 총자산, 최근 체결, 인기/최근 본 종목, 접속자 수, 확성기 글을 본다. |
| 시세 | 종목 목록을 검색하고 종목 상세/차트/최근 체결을 확인한다. |
| 주문 | 종목을 선택해 시장가/지정가 매수·매도 주문을 넣는다. |
| 차트 | 종목별 가격 흐름을 비교한다. |
| 랭킹 | 실현손익, 배당, 후원 랭킹을 본다. |
| 상점 | 닉네임 변경권, 종목 추가권, 확성기 기능을 사용한다. |
| 보유 | 내 보유 종목과 평가 상태를 본다. |
| 설정 | 닉네임, 랭킹 공개 여부, 테마 등 계정 설정을 바꾼다. |
| 가이드 | 서비스 이용 가이드를 본다. |
| 공지 | 주식 분할 등 공지 아카이브를 본다. |

데스크톱에서는 왼쪽 `Sidebar`와 상단 `DesktopTabBar`를 사용한다. 모바일에서는 하단 `MobileNavBar`와 스와이프 가능한 탭 뷰를 사용한다.

---

## 3. 디렉터리 구조

```text
frontend/
├── package.json
├── vite.config.ts
├── index.html
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── robots.txt
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── App.css
    ├── firebase.ts
    ├── types.ts
    ├── utils.ts
    ├── lib/
    │   ├── api.ts
    │   └── stompClient.ts
    ├── contexts/
    │   └── ThemeContext.tsx
    ├── data/
    │   └── stocks.ts
    ├── hooks/
    │   └── use*.ts
    └── components/
        ├── layout/
        ├── common/
        ├── home/
        ├── prices/
        ├── order/
        ├── chart/
        ├── rankings/
        ├── holdings/
        ├── shop/
        ├── settings/
        ├── profile/
        ├── guide/
        └── announcements/
```

### 계층별 책임

| 영역 | 책임 |
| --- | --- |
| `App.tsx` | 앱 전체 조립. 인증, 종목/포트폴리오 데이터, 네비게이션, 레이아웃 분기, 탭 렌더링을 묶는다. |
| `components/` | 실제 화면과 UI 조각. 화면 단위 View와 공통 패널/카드가 들어 있다. |
| `hooks/` | 서버 데이터 조회, mutation, 실시간 구독, 네비게이션, 제스처 같은 상태 로직. |
| `lib/` | 백엔드 API fetch wrapper와 STOMP client singleton. |
| `contexts/` | 전역 React context. 현재는 theme 상태를 제공한다. |
| `data/` | 클라이언트에서 쓰는 정규화 타입과 기본 데이터. |
| `utils.ts` | 가격/수량 포맷, 등락률, 색상 등 표시 유틸. |
| `firebase.ts` | Firebase app/auth/provider/firestore 초기화. |

---

## 4. 앱 부트스트랩

`main.tsx`가 React 앱을 시작한다.

```text
main.tsx
  -> createRoot(...)
  -> StrictMode
  -> QueryClientProvider
  -> ThemeProvider
  -> App
```

전역 Provider:

| Provider | 역할 |
| --- | --- |
| `QueryClientProvider` | React Query 캐시와 query/mutation 기능 제공 |
| `ThemeProvider` | dark/light theme 상태 제공, `html.light-mode` class 관리 |

`QueryClient`는 기본 옵션 없이 생성되어 있으며, 각 hook에서 개별 `queryKey`, `enabled`, `refetchInterval`을 지정한다.

---

## 5. 환경 변수와 개발 서버

### API/WebSocket 설정

`src/lib/api.ts`:

| 값 | 설명 |
| --- | --- |
| `API_BASE` | `import.meta.env.VITE_API_BASE_URL ?? ''` |
| `WS_URL` | `import.meta.env.VITE_WS_URL ?? 'http://localhost:5173/ws'` |

`apiFetch(path, options)`는 Firebase 현재 사용자의 ID Token을 가져와 `Authorization: Bearer {token}` 헤더를 자동으로 붙인다. 모든 JSON 요청에는 기본으로 `Content-Type: application/json`이 들어간다.

### Firebase 설정

`src/firebase.ts`는 아래 env를 사용한다.

| 환경 변수 | 용도 |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | App ID |

초기화 후 다음을 export한다.

| export | 설명 |
| --- | --- |
| `auth` | Firebase Auth instance |
| `googleProvider` | Google login provider |
| `db` | Firestore instance. 현재 주요 화면 로직은 REST API 중심이다. |

### Vite 개발 서버

`vite.config.ts`는 React/Tailwind plugin을 등록하고, 개발 중 `/api`, `/ws`를 운영 도메인으로 프록시한다.

```text
/api -> https://spotchzxk.xyz
/ws  -> https://spotchzxk.xyz
```

로컬 백엔드를 붙이고 싶다면 `VITE_API_BASE_URL`, `VITE_WS_URL` 또는 Vite proxy 설정을 조정해야 한다.

---

## 6. App.tsx의 역할

`App.tsx`는 프론트엔드의 조립 지점이다. 개별 화면의 세부 UI는 컴포넌트에 맡기지만, 앱 전역 상태 흐름은 여기서 연결된다.

주요 흐름:

```text
App
  -> 화면 폭 감지: desktop/mobile layout 결정
  -> useAuth: Firebase 로그인/게스트/계정 연결 상태
  -> useStocks: 전체 종목 REST load + STOMP live merge
  -> useAppNavigation: activeTab, selectedStreamer, browser history
  -> useLiveTrades: 최근 체결 REST load + /topic/trades
  -> useOnlineCount: 접속자 수
  -> usePortfolio: 내 포트폴리오
  -> useTransactionHistory: 내 주문 이력
  -> useResetPortfolio: 포트폴리오 초기화 mutation
  -> renderTabContent(activeTab)
```

데스크톱:

```text
Sidebar + DesktopTabBar + 현재 탭 화면
```

모바일:

```text
현재 탭 화면 + swipe viewport + MobileNavBar
```

`AnnouncementPopup`과 게스트 제한 안내용 `GuestLimitModal`은 layout 바깥에서 항상 렌더링된다.

---

## 7. 네비게이션 구조

이 앱은 `react-router`를 사용하지 않는다. 대신 `useAppNavigation`이 탭 상태와 browser history를 직접 관리한다.

### 탭 타입

`types.ts`의 `AppTab`:

```ts
type AppTab =
  | 'home'
  | 'prices'
  | 'order'
  | 'chart'
  | 'rankings'
  | 'profile'
  | 'shop'
  | 'holdings'
  | 'settings'
  | 'guide'
  | 'announcements';
```

### 상태

| 상태 | 의미 |
| --- | --- |
| `activeTab` | 현재 화면 탭 |
| `selectedStreamer` | 상세/주문에서 선택된 종목 |
| `initialOrderType` | 종목 상세에서 매수/매도 버튼으로 주문 화면에 들어갈 때 초기 주문 방향 |
| `recentlyViewedIds` | 최근 본 종목 ID 목록 |
| `screenHistory` | 앱 내부 뒤로가기용 화면 스택 |
| `mobileRouteMotion` | 모바일 스택 화면 전환 애니메이션 방향 |

### URL 직접 접근

초기 path가 `/stocks/{id}`이면 `prices` 탭으로 시작하고, 종목 목록이 로드된 뒤 해당 종목을 선택한다. 이 방식으로 공유 링크나 OG 페이지 진입 후 앱 내부 상세로 연결할 수 있다.

### 모바일 스와이프

`useSwipeGesture`가 스와이프 가능한 주요 탭을 관리한다.

```ts
SWIPE_TABS = ['home', 'prices', 'chart', 'rankings', 'shop', 'profile']
```

`order`, `holdings`, `settings`, `guide`, `announcements`는 스택형 화면으로 취급되어 좌우 스와이프 대상이 아니다.

---

## 8. 인증 흐름

인증은 `useAuth`가 담당한다.

### Google 로그인

```text
handleGoogleLogin()
  -> Firebase signInWithPopup(auth, googleProvider)
  -> onAuthStateChanged에서 user state 갱신
```

### 게스트 로그인

게스트 로그인은 abuse 방지를 위해 백엔드 precheck를 먼저 수행한다.

```text
handleGuestLogin()
  -> FingerprintJS 로 visitorId 생성
  -> POST /api/guest/precheck { fingerprintHash }
  -> 통과하면 Firebase signInAnonymously()
  -> POST /api/guest/register { precheckToken, fingerprintHash }
  -> 실패/제한이면 GuestLimitModal 표시
```

게스트가 로그아웃하면 Firebase에서 즉시 signOut하지 않고 `guest_soft_logged_out` localStorage flag를 세워 앱에서만 로그아웃된 것처럼 처리한다. 이후 Google 로그인 시 필요한 경우 Firebase signOut을 수행한다.

### 계정 연결

게스트 사용자는 `handleLinkGoogle()`로 Google 계정을 연결한다.

```text
linkWithPopup(user, googleProvider)
  -> 성공: POST /api/auth/upgrade-guest
  -> credential-already-in-use:
       pendingGuestMerge 저장
       signInWithCredential(...)
       onAuthStateChanged에서 POST /api/auth/link-google
```

localStorage key:

| Key | 의미 |
| --- | --- |
| `has_linked_account` | Google 연동 완료 여부 |
| `guest_soft_logged_out` | 익명 사용자 soft logout 상태 |
| `pendingGuestMerge` | Google 계정 충돌 후 병합해야 할 게스트 UID |

---

## 9. 서버 통신 구조

### REST API wrapper

`apiFetch`는 앱의 표준 fetch 함수다.

```text
apiFetch('/api/portfolio')
  -> Firebase currentUser.getIdToken()
  -> Authorization header 추가
  -> fetch(`${API_BASE}${path}`, options)
```

인증이 필요한 API도 이 wrapper를 쓰면 토큰이 자동으로 들어간다. 단, 일부 hook은 공개 API에 대해 직접 `fetch`를 쓰기도 한다.

### React Query 사용 방식

서버 상태는 대부분 React Query hook으로 관리한다.

| queryKey | hook | 데이터 |
| --- | --- | --- |
| `['portfolio', userId]` | `usePortfolio` | 내 잔고/보유량/티켓/랭킹 상태 |
| `['history', userId]` | `useTransactionHistory`, `usePendingOrders` | 내 주문 이력 |
| `['order-book', streamerId]` | `useOrderBook` | 호가창 |
| `['megaphone-posts']` | `useVisibleMegaphonePosts` | 확성기 글 |
| `['megaphone-uses-today', uid]` | `useMegaphoneUsesToday` | 오늘 확성기 사용 횟수 |

polling은 실시간 누락을 보완하기 위해 사용된다.

| 데이터 | 주기 |
| --- | --- |
| 포트폴리오 | 60초 |
| 주문 이력 | 4초 |
| 미체결 주문 목록 | 3초 |
| 호가창 | 2초 |
| 확성기 글 | 30초 |

---

## 10. STOMP 실시간 구조

`lib/stompClient.ts`는 앱 전체에서 공유하는 STOMP singleton을 만든다.

```text
getStompClient()
  -> 없으면 new Client(...)
  -> SockJS(WS_URL)
  -> reconnectDelay = 3000
  -> onConnect 시 등록된 listener 재실행
```

핵심 함수:

| 함수 | 역할 |
| --- | --- |
| `getStompClient()` | singleton STOMP client 반환/생성 |
| `registerOnConnect(callback)` | 최초 연결과 재연결 때 실행할 callback 등록 |
| `subscribeStomp(destination, callback)` | 토픽 구독. 재연결 시 자동 재구독 |

주요 구독:

| 토픽 | 사용하는 곳 | 효과 |
| --- | --- | --- |
| `/topic/streamers` | `useStocks` | 종목 목록/가격/라이브 상태 병합 |
| `/topic/trades` | `useStocks`, `useLiveTrades` | 가격/거래량 즉시 반영, 최근 체결 추가 |
| `/topic/dividends` | `useDividends`, `useDividendHistory` | 배당 피드와 내 배당 내역 갱신 |
| `/topic/user-dividends/{uid}` | `App`, `useDividendHistory` | 포트폴리오 invalidate, 개인 배당 내역 추가 |
| `/topic/megaphone` | `useVisibleMegaphonePosts` | 확성기 글 실시간 추가 |
| `/topic/online-count` | `useOnlineCount` | 접속자 수 갱신 |
| `/topic/orders/{uid}` | `usePendingOrders` | 주문/포트폴리오 invalidate 보조 경로 |

`/topic/orders/{uid}`는 프론트엔드에서 구독하지만, 백엔드 발행 구현 여부에 따라 polling이 실제 안전망 역할을 한다.

---

## 11. 종목 데이터 흐름

종목 타입은 `data/stocks.ts`의 `Stock`이다. 백엔드 `Stock` 응답을 화면에서 쓰기 좋은 형태로 정규화한다.

주요 필드:

| 필드 | 의미 |
| --- | --- |
| `id` | channelId |
| `name` | streamerName |
| `price` | currentPrice |
| `totalVolume` | dailyVolume |
| `dailyTradingValue` | dailyTradingValue |
| `basePrice` | 등락률 기준가 |
| `followers` | followerCount |
| `profileImageUrl` | 프로필 이미지 |
| `isLive` | 라이브 여부 |
| `coinReserve`, `shareReserve` | 클라이언트 주문 예상 계산용 AMM reserve |
| `tradingSuspended` | 주문 비활성화 표시 |

`useStocks` 흐름:

```text
1. registerOnConnect(fetchStocks)
2. GET /api/stocks
3. mapRawToStock()으로 백엔드 필드 정규화
4. /topic/streamers 수신 시 기존 목록에 merge
5. /topic/trades 수신 시 해당 종목 price, volume, tradingValue, reserve 즉시 갱신
```

이렇게 해서 화면은 REST 초기값과 STOMP 실시간 이벤트를 합친 최신 종목 목록을 사용한다.

---

## 12. 거래 화면과 주문 흐름

### 화면 구성

주문 관련 컴포넌트:

| 컴포넌트 | 역할 |
| --- | --- |
| `OrderView` | 주문할 종목 선택 또는 선택 종목의 주문 폼 표시 |
| `OrderForm` | 매수/매도, 시장가/지정가, 수량, 예상 금액, 주문 제출 |
| `OrderBookPanel` | 호가창 표시 |
| `PendingOrdersPanel` | 미체결 주문 목록과 취소 버튼 |

### 클라이언트 예상 금액 계산

`OrderForm`은 백엔드 AMM 계산과 같은 공식을 클라이언트에서 사용해 주문 전 예상 금액을 보여준다.

매수:

```text
ammCost = ceil(coinReserve * qty / (shareReserve - qty))
fee = ceil(ammCost * 1.5%)
userPays = ammCost + fee
```

매도:

```text
ammRevenue = coinReserve * qty / (shareReserve + qty)
fee = ceil(ammRevenue * 1.5%)
userReceives = ammRevenue - fee
```

reserve가 없으면 `currentPrice * quantity` 기반 fallback 계산을 사용한다.

### 주문 제출

`useTrade`가 `POST /api/trade` mutation을 담당한다.

```text
OrderForm.handleSubmit()
  -> useTrade.mutate({
       streamerId,
       type,
       quantity,
       estimatedPrice,
       estimatedExecutionPrice,
       estimatedTotalAmount,
       orderMode,
       limitPrice
     })
  -> apiFetch('/api/trade', POST)
```

`useTrade`는 낙관적 업데이트를 수행한다.

```text
onMutate
  -> portfolio/history query cancel
  -> previousPortfolio 저장
  -> 시장가 주문이면 shares와 balance를 예상값으로 즉시 변경

onSuccess
  -> 서버 newBalance가 있으면 portfolio cache에 반영
  -> history invalidate

onError
  -> previousPortfolio rollback
  -> alert(error.message)

onSettled
  -> 3.5초 후 portfolio/history invalidate
```

지정가 주문은 즉시 체결되지 않을 수 있으므로 shares를 낙관적으로 바꾸지 않는다.

### 주문 취소와 미체결 주문

`usePendingOrders`는 `/api/orders`에서 전체 주문을 받아 `status === 'pending'`만 필터링한다. 취소는 `POST /api/trade/cancel?orderId={id}`로 보낸다.

업데이트 방식:

- 3초 polling
- `/topic/orders/{uid}` 구독 시 history/portfolio invalidate
- 취소 성공 시 history/portfolio invalidate

---

## 13. 시세, 상세, 차트

### PricesView

`PricesView`는 종목 목록과 종목 상세를 전환한다.

- 검색어가 있으면 종목명 기준으로 필터링한다.
- 목록은 한국어 locale 기준 이름순으로 정렬한다.
- 라이브 종목은 초록 ring과 `LIVE` badge로 표시한다.
- 종목을 선택하면 `StockDetail`로 들어간다.

### StockDetail

`StockDetail`은 선택 종목의 상세 정보를 보여주고 주문 화면으로 연결한다.

주요 역할:

- 현재가, 등락률, 거래량, 라이브 상태 표시
- 차트/캔들 데이터 표시
- 최근 체결 목록 표시
- 매수/매도 버튼으로 `order` 탭 이동

### Chart

차트 관련 파일:

| 파일 | 역할 |
| --- | --- |
| `components/chart/InteractiveChart.tsx` | lightweight-charts 기반 차트 UI |
| `components/chart/chartUtils.ts` | 차트 데이터/표시 보조 함수 |
| `components/rankings/ChartView.tsx` | 차트 탭 화면 |

캔들 데이터는 백엔드 `/api/stocks/{id}/candles`와 `/topic/candles/{id}`를 통해 갱신되는 구조다.

---

## 14. 포트폴리오와 보유 화면

`usePortfolio(user?.uid)`는 로그인 사용자의 포트폴리오를 가져온다.

`Portfolio` 타입:

| 필드 | 의미 |
| --- | --- |
| `balance` | 잔고. 큰 수 정밀도를 위해 string |
| `shares` | `channelId -> quantity` |
| `avgPrices` | `channelId -> 평균단가` |
| `dividendTotal` | 누적 배당 |
| `donationTotal` | 누적 후원 |
| `displayName` | 표시 이름 |
| `realizedProfit` | 실현손익 |
| `rankingNicknamePublic` | 랭킹 닉네임 공개 여부 |
| `nicknameChangeTickets` | 닉네임 변경권 |
| `stockAddTickets` | 종목 추가권 |
| `remainingResets` | 오늘 남은 초기화 횟수 |

`App.tsx`는 포트폴리오와 종목 가격을 합쳐 총자산을 계산한다.

```text
totalAssets = balance + sum(stock.price * heldQuantity)
```

`HoldingsView`는 보유 종목 목록, 평가액, 평균단가 기반 손익 등을 보여주며, 종목 상세/주문 화면으로 이동할 수 있다.

포트폴리오 초기화는 `useResetPortfolio` mutation으로 처리한다. `App.tsx`에서 먼저 보유 주식이 있는지 확인하고, 사용자 confirm 후 `/api/portfolio/reset`을 호출한다.

---

## 15. 배당 흐름

배당 화면/피드는 두 종류다.

| hook | 데이터 | 방식 |
| --- | --- | --- |
| `useDividends` | 전체 최근 배당 이벤트 | REST 초기 로드 + `/topic/dividends` |
| `useDividendHistory` | 내 배당 내역 | REST 초기 로드 + global/personal STOMP |

`useDividends`:

```text
GET /api/dividends/recent
  -> dividends state 초기화
/topic/dividends
  -> 새 배당 이벤트를 앞에 추가
  -> 최대 30개 유지
```

`useDividendHistory`:

```text
로그인 사용자인 경우 GET /api/dividends/my
/topic/dividends 수신 시 전체 내역 재조회
/topic/user-dividends/{uid} 수신 시 개인 내역에 즉시 추가
```

`App.tsx`도 `/topic/user-dividends/{uid}`를 구독해 배당이 들어오면 `['portfolio', uid]`를 invalidate한다.

---

## 16. 확성기와 상점

### 확성기

`useMegaphone.ts`가 확성기 상태를 담당한다.

| hook | 역할 |
| --- | --- |
| `useVisibleMegaphonePosts` | 공개 확성기 글 목록. REST + STOMP 병합 |
| `useMegaphoneUsesToday` | 오늘 내 확성기 사용 횟수 |
| `useMegaphoneSubmit` | 확성기 사용 mutation |

확성기 글 흐름:

```text
GET /api/shop/megaphone/posts
  -> 최근 글 로드
/topic/megaphone
  -> 새 글을 cache 앞에 merge
POST /api/shop/megaphone
  -> 성공 시 글 목록, 사용 횟수, 포트폴리오 invalidate
```

### 상점

`ShopView`는 상점 아이템 구매와 확성기 기능을 제공한다.

주요 서버 API:

| API | 설명 |
| --- | --- |
| `POST /api/shop/items/purchase` | 닉네임 변경권/종목 추가권 구매 |
| `POST /api/shop/megaphone` | 확성기 사용 |
| `GET /api/shop/megaphone/my-uses-today` | 오늘 내 확성기 사용 횟수 |

상점 구매 후에는 포트폴리오 cache를 갱신해야 티켓 수량과 잔고가 즉시 반영된다.

---

## 17. 랭킹, 설정, 공지

### 랭킹

`UserRankingView`는 `/api/rankings`를 조회해 사용자 랭킹을 보여준다.

랭킹 타입:

| type | 의미 |
| --- | --- |
| `realized` | 실현손익 |
| `dividend` | 누적 배당 |
| `donation` | 누적 후원 |

### 설정

`SettingsView`는 포트폴리오에 포함된 계정 상태를 기반으로 닉네임과 공개 여부를 변경한다.

관련 hook:

| hook | 역할 |
| --- | --- |
| `useNicknameEdit` | 닉네임 변경 요청과 관련 cache 갱신 |
| `useTheme` | light/dark theme toggle |

### 공지

`AnnouncementPopup`은 주요 공지를 팝업으로 표시하고, `AnnouncementArchiveView`는 공지 목록을 보여준다. 주식 분할 최신 공지는 백엔드 `/api/announcements/stock-splits/latest`와 연결된다.

---

## 18. 화면 컴포넌트 요약

| 경로 | 역할 |
| --- | --- |
| `components/layout/Sidebar.tsx` | 데스크톱 좌측 패널. 로그인, 포트폴리오 요약, 네비게이션 |
| `components/layout/DesktopTabBar.tsx` | 데스크톱 상단 탭 |
| `components/layout/MobileNavBar.tsx` | 모바일 하단 탭 |
| `components/home/HomeView.tsx` | 홈 대시보드 |
| `components/prices/PricesView.tsx` | 시세 목록과 상세 진입 |
| `components/prices/StockDetail.tsx` | 종목 상세 |
| `components/order/OrderView.tsx` | 주문 종목 선택/주문 폼 |
| `components/order/OrderForm.tsx` | 주문 입력과 제출 |
| `components/order/OrderBookPanel.tsx` | 호가창 |
| `components/order/PendingOrdersPanel.tsx` | 미체결 주문 |
| `components/rankings/ChartView.tsx` | 차트 탭 |
| `components/rankings/UserRankingView.tsx` | 사용자 랭킹 |
| `components/holdings/HoldingsView.tsx` | 보유 종목 |
| `components/shop/ShopView.tsx` | 상점/확성기 |
| `components/settings/SettingsView.tsx` | 설정 |
| `components/guide/GuideView.tsx` | 이용 가이드 |
| `components/announcements/AnnouncementArchiveView.tsx` | 공지 아카이브 |
| `components/common/*` | 공통 카드, 모달, 접속자 badge, 확성기 목록 |

---

## 19. 스타일과 테마

스타일은 Tailwind utility class와 CSS custom property를 함께 사용한다.

주요 파일:

| 파일 | 역할 |
| --- | --- |
| `index.css` | 전역 스타일, CSS 변수, Tailwind import |
| `App.css` | 앱별 보조 스타일 |
| `ThemeContext.tsx` | `light-mode` class toggle |

테마 흐름:

```text
ThemeProvider
  -> localStorage 'spotchzxk-theme' 확인
  -> 없으면 prefers-color-scheme 사용
  -> theme === 'light'이면 document.documentElement.classList.add('light-mode')
  -> 변경 시 localStorage에 저장
```

컴포넌트는 `var(--bg-sidebar)`, `var(--text-dim)`, `surface-card` 같은 token class/variable을 사용한다.

---

## 20. 숫자와 포맷 유틸

프론트엔드는 가격, 수량, 큰 금액을 자주 표시하므로 `utils.ts`에 포맷 로직이 모여 있다.

대표 용도:

| 함수/개념 | 역할 |
| --- | --- |
| `fmt` | 가격/금액 표시 |
| `fmtCompact` | 거래량 등 큰 수 축약 |
| `fmtPct` | 등락률 표시 |
| `fmtBigInt` | 매우 큰 금액 표시 |
| `fmtShares` | 보유 주식 수량 표시 |
| `changePct` | 현재가와 기준가로 등락률 계산 |
| `priceColorClass`, `tradeColorClass` | 상승/하락/매수/매도 색상 class |
| `avatarColor` | 프로필 이미지가 없을 때 이름 기반 fallback 색상 |

잔고나 AMM 금액은 큰 수가 될 수 있으므로 일부 계산은 `bigint`를 사용한다. 포트폴리오 `balance`도 string으로 받아 화면에서 필요할 때 숫자로 변환한다.

---

## 21. 로컬 실행과 빌드

프론트엔드 디렉터리:

```text
frontend/
```

설치:

```powershell
npm install
```

개발 서버:

```powershell
npm run dev
```

빌드:

```powershell
npm run build
```

린트:

```powershell
npm run lint
```

프리뷰:

```powershell
npm run preview
```

---

## 22. 프론트엔드 코드를 읽는 추천 순서

처음 구조를 이해하려면 아래 순서가 좋다.

1. `src/main.tsx`  
   앱 Provider 구조를 확인한다.

2. `src/App.tsx`  
   인증, 종목, 포트폴리오, 네비게이션, 레이아웃이 어떻게 조립되는지 본다.

3. `src/lib/api.ts`, `src/lib/stompClient.ts`  
   REST와 WebSocket 통신 방식을 파악한다.

4. `src/hooks/useAuth.ts`  
   Google/게스트 로그인과 계정 연결 흐름을 이해한다.

5. `src/hooks/useStocks.ts`, `src/hooks/usePortfolio.ts`, `src/hooks/useTrade.ts`  
   핵심 데이터와 거래 mutation 흐름을 본다.

6. `src/hooks/useAppNavigation.ts`, `src/hooks/useSwipeGesture.ts`  
   라우터 없이 탭/뒤로가기/모바일 스와이프를 구현한 방식을 본다.

7. `src/components/order/OrderForm.tsx`  
   AMM 예상 계산, 주문 가능 조건, 주문 제출 UI를 확인한다.

8. `src/components/prices/StockDetail.tsx`, `src/components/chart/InteractiveChart.tsx`  
   종목 상세와 차트 표시를 확인한다.

9. `src/components/*View.tsx`  
   각 화면의 사용자 기능을 훑는다.

---

## 23. 주의할 점

- `apiFetch`는 Firebase ID Token을 자동 첨부하므로 인증 API 호출은 가능하면 이 wrapper를 사용한다.
- `API_BASE` 기본값은 빈 문자열이다. 개발 서버에서는 Vite proxy가 `/api`를 운영 서버로 보내고 있다.
- `WS_URL` 기본값은 `http://localhost:5173/ws`이며, 개발 서버 proxy가 `/ws`를 운영 서버로 전달한다.
- React Query cache key는 사용자별 데이터에 반드시 `userId`를 포함해야 다른 사용자 캐시가 섞이지 않는다.
- 거래 화면의 AMM 계산은 사용자에게 보여주는 예상값이다. 최종 체결과 검증은 백엔드가 한다.
- 지정가 주문은 즉시 체결되지 않을 수 있으므로 시장가와 같은 방식으로 보유량을 낙관적으로 바꾸면 안 된다.
- STOMP 구독은 재연결 시 자동 복구되지만, 중요한 데이터는 polling이나 query invalidate로 한 번 더 보정한다.
- 모바일 스와이프는 chart 영역에서 충돌할 수 있어 특정 chart DOM 경로는 swipe ignore 처리한다.
- 큰 금액은 `number`만으로 안전하지 않을 수 있다. 주문 예상 금액처럼 큰 정수 계산은 `bigint`를 사용한다.
- 라우터 라이브러리가 없으므로 새 화면을 추가할 때는 `AppTab`, `useAppNavigation`, layout tab 컴포넌트, `renderTabContent`를 함께 수정해야 한다.
