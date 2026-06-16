# Spotchzxk 백엔드 구조 상세 설명서

작성일: 2026-06-08 / 최종 업데이트: 2026-06-16  
기준 코드: `backend/src/main/java/com/spotchzxk`

---

## 1. 한눈에 보는 백엔드

Spotchzxk는 치지직(Chzzk) 스트리머를 종목처럼 등록하고, 사용자가 가상 원화로 매수/매도하는 모의 주식 거래 서비스다. 백엔드는 다음 역할을 맡는다.

- Firebase ID Token으로 사용자를 인증하고, 게스트/Google 계정 상태를 구분한다.
- Chzzk OpenAPI에서 채널 정보와 라이브 상태를 가져와 종목을 만들고 갱신한다.
- AMM 풀을 이용해 거래 가격을 계산하고, 사용자 잔고/보유량/주문 이력을 일관되게 저장한다.
- 라이브 중인 종목에 대해 방송 시작 시점 보유량 기준으로 1시간마다 배당을 지급한다.
- 고가 종목은 6시간마다 10:1 주식 분할을 수행해 가격과 보유 수량을 보정한다.
- WebSocket/STOMP로 가격, 체결, 캔들, 배당, 확성기, 접속자 수를 실시간 발행한다.

**핵심 특징**

| 주제 | 설명 |
| --- | --- |
| 거래 가격 | CPAMM(Constant Product AMM), `coinReserve * shareReserve = k` |
| 수수료 | AMM 거래 금액의 1.5%. 일부는 `feePool`, 나머지는 소각성 금액으로 계산 |
| 배당 | 라이브 시작 시점 보유량(`preStreamQuantity`)에 대해 시간당 현재가의 0.01% |
| 가격 단위 | 주요 가격은 `DECIMAL(65,6)`로 소수 6자리까지 지원 |
| 인증 | Firebase ID Token, 서버 내부 principal은 Firebase UID |
| 실시간 | SockJS `/ws`, STOMP broker `/topic` |
| DB | MySQL, Flyway V1-V62 마이그레이션 |

**Tech Stack**

| 구분 | 내용 |
| --- | --- |
| Language | Java 17 |
| Framework | Spring Boot 3.5.0 |
| ORM | Spring Data JPA (Hibernate) |
| DB/Cache | MySQL + Flyway, Redis, Caffeine |
| 인증 | Firebase Admin SDK ID Token |
| 실시간 | Spring WebSocket + STOMP + SockJS |
| 외부 연동 | Chzzk OpenAPI |
| 빌드 | Gradle |

---

## 2. 도메인 용어

처음 코드를 볼 때 헷갈리기 쉬운 용어는 아래처럼 이해하면 된다.

| 용어 | 의미 |
| --- | --- |
| 사용자(`User`) | Firebase UID를 ID로 쓰는 서비스 사용자. 잔고, 닉네임, 티켓, 랭킹 누적값을 가진다. |
| 게스트 | Firebase 익명 로그인 기반 사용자. `isGuest=true`로 저장된다. |
| Google 사용자 | Firebase Google 계정으로 로그인한 사용자. 종목 등록 같은 일부 기능에 필요하다. |
| 종목(`Stock`) | 치지직 채널 하나를 거래 가능한 종목으로 만든 것. PK는 `channelId`다. |
| 주문(`Order`) | 매수/매도 요청 기록. 시장가와 지정가 모드를 모두 표현한다. |
| 보유 주식(`UserShare`) | 사용자별 종목 보유량과 평균단가. 배당 기준 스냅샷도 여기에 저장된다. |
| AMM 풀 | 종목별 가상 유동성 풀. `coinReserve`와 `shareReserve`로 가격을 산출한다. |
| 현재가 | `coinReserve / shareReserve`로 계산되는 AMM spot price. |
| 배당 | 라이브 중인 스트리머 종목의 보유자에게 지급하는 가상 원화. |
| 확성기 | 라이브 중인 종목에 메시지를 올리는 유료 기능. |
| 종목 추가권 | Google 사용자가 새 종목을 등록할 때 쓰는 티켓. |
| 닉네임 변경권 | 프로필 닉네임 변경에 쓰는 티켓. |
| 주식 분할 | 가격이 1,000,000원을 넘은 종목을 10:1로 나누는 작업. 가격은 1/10, 수량은 10배가 된다. |
| 거래정지 | `stocks.trading_suspended`가 true인 상태. 거래 엔진에서 주문을 막는 용도다. |

---

## 3. 패키지 구조

현재 백엔드는 presentation/application/domain/infrastructure/shared 계층으로 나뉜다.

```text
backend/src/main/java/com/spotchzxk/
├── SpotchzxkApplication.java
├── presentation/
│   ├── controller/       # HTTP 요청, OG HTML, sitemap 엔드포인트
│   └── dto/              # 요청/응답 DTO
├── application/          # 유스케이스, 거래 엔진, 스케줄러, 캐시/브로드캐스트 조율
├── domain/
│   ├── stock/            # 종목/분할 엔티티와 repository
│   ├── order/            # 주문 엔티티와 repository
│   ├── user/             # 사용자/보유/사용자 배당 엔티티와 repository
│   ├── dividend/         # 배당 로그 엔티티와 repository
│   ├── megaphone/        # 확성기 엔티티와 repository
│   └── trading/          # AMM 계산기와 거래 정책
├── infrastructure/
│   ├── chzzk/            # 외부 Chzzk API client
│   ├── config/           # Security, WebSocket, Firebase, Flyway, Async 설정
│   └── security/         # FirebaseTokenFilter
└── shared/
    └── exception/        # 공통 예외
```

### 계층별 책임

| 계층 | 책임 | 예시 |
| --- | --- | --- |
| `presentation` | HTTP 요청/응답, 인증 principal 추출, 단순 validation, status code 변환 | `TradeController`, `StockController` |
| `application` | 실제 비즈니스 흐름 조립, 트랜잭션, 스케줄링, WebSocket 발행 | `TradeEngine`, `DividendService` |
| `domain` | DB에 저장되는 핵심 모델과 repository, 순수 계산/정책 | `Stock`, `Order`, `AmmCalculator` |
| `infrastructure` | 외부 시스템과 프레임워크 설정 | `ChzzkApiClient`, `SecurityConfig` |
| `shared` | 여러 계층에서 쓰는 예외/공통 타입 | `ChannelNotFoundException` |

### 컨트롤러 목록

| 파일 | 주요 엔드포인트 | 역할 |
| --- | --- | --- |
| `TradeController` | `/health`, `/api/trade`, `/api/trade/cancel` | 거래 제출과 미체결 주문 취소 |
| `StockController` | `/api/stocks`, `/api/stocks/{id}/order-book` | 종목 조회/등록, 호가창 조회 |
| `CandleController` | `/api/stocks/{id}/candles` | OHLC 캔들 조회 |
| `OrderController` | `/api/orders`, `/api/orders/recent`, `/api/orders/history` | 주문 이력 조회 |
| `PortfolioController` | `/api/portfolio`, `/api/portfolio/reset` | 포트폴리오 조회/초기화 |
| `DividendController` | `/api/dividends/recent`, `/api/dividends/my` | 배당 로그 조회 |
| `RankingController` | `/api/rankings` | 실현손익/배당/후원 랭킹 |
| `ProfileController` | `/api/profile/*` | 닉네임과 랭킹 공개 설정 |
| `ShopController` | `/api/shop/*` | 확성기와 상점 아이템 |
| `DonationController` | `/api/donate` | 코인 소각 후원 |
| `GuestController` | `/api/guest/precheck`, `/api/guest/register` | 게스트 생성 제한과 등록 |
| `AccountLinkController` | `/api/auth/link-google`, `/api/auth/upgrade-guest` | 게스트 계정 병합/승격 |
| `AuthController` | `/api/auth/me` | 현재 인증 상태 확인 |
| `AnnouncementController` | `/api/announcements/stock-splits/latest` | 주식 분할 공지 |
| `AdminController` | `/api/admin/*` | 운영자 수동 작업 |
| `OnlineController` | `/api/online-count` | 접속자 수 |
| `OgController` | `/og/stocks/{id}`, `/og/home` | 공유용 HTML |
| `SitemapController` | `/sitemap.xml` | 검색엔진 sitemap |

### 주요 application 서비스

| 파일 | 설명 |
| --- | --- |
| `TradeEngine` | 거래의 중심. 사용자 잠금, 시장가/지정가 체결, 잔고/보유량/AMM 풀/주문 저장, 캐시 무효화, 실시간 발행을 담당한다. |
| `StockService` | 종목 목록 캐시, Chzzk 채널 조회, 종목 등록, 호가창 집계를 담당한다. |
| `CandleService` | 주문 이력을 interval별 OHLC로 집계하고, 최근 캔들을 캐싱하며, 라이브 종목의 현재 분봉을 발행한다. |
| `DividendService` | 배당 대상자 탐색, 사용자 잔고 증가, 배당 로그 저장, 개인/전체 배당 토픽 발행을 담당한다. |
| `ChzzkLivePollingService` | Chzzk 라이브 상태를 주기적으로 가져오고 라이브 시작/종료 상태 전환 및 배당 tick을 실행한다. |
| `StockSplitService` | 고가 종목을 10:1로 분할하고, 주식/주문/AMM/공지/이벤트를 함께 보정한다. |
| `DailyResetService` | 매일 자정 기준가와 일일 거래량/거래대금을 리셋하고 랭킹 reset 이벤트를 발행한다. |
| `AmmMigrationService` | AMM 필드가 비어 있는 기존 종목에 풀 값을 채운다. 서버 시작 시에도 동작 가능한 ApplicationRunner다. |
| `PortfolioService` | 사용자 생성/조회, 포트폴리오 반환, 보유 주식과 미체결 주문이 없을 때 하루 3회까지 초기화한다. |
| `GuestAbuseProtectionService` | IP/fingerprint window를 기준으로 게스트 생성 남용을 막고 precheck permit을 발급/소비한다. |
| `AccountLinkService` | 게스트 계정을 Google 계정으로 병합하거나 현재 계정을 등록 사용자로 승격한다. |
| `MegaphoneService` | 확성기 사용 가능 여부, 비용 차감, 게시글 저장, 토픽 발행을 처리한다. |
| `ShopItemService` | 상점 아이템 구매 후 사용자 티켓 수량을 증가시킨다. |
| `OnlineUserService` | WebSocket session connect/disconnect 이벤트를 기반으로 접속자 수를 관리하고 발행한다. |
| `AsyncBroadcastService` | `broadcastExecutor`를 이용해 WebSocket 발행을 비동기로 분리한다. |

---

## 4. 핵심 데이터 모델

### User

`users` 테이블은 사용자 계정과 랭킹/상점 상태를 함께 가진다.

| 필드 | 설명 |
| --- | --- |
| `id` | Firebase UID. 모든 사용자 식별의 기준이다. |
| `coinBalance` | 가상 원화 잔고. 거래, 후원, 상점 구매, 배당으로 변한다. |
| `displayName` | 서비스 표시 닉네임. |
| `realizedProfit` | 매도 등으로 확정된 실현 손익. 랭킹에 사용된다. |
| `rankingNicknamePublic` | 랭킹에서 닉네임 공개 여부. false면 비공개 표시. |
| `nicknameChangeTickets` | 닉네임 변경권 개수. |
| `stockAddTickets` | 종목 추가권 개수. |
| `resetCount`, `lastResetDate` | 포트폴리오 초기화 일일 제한 추적. |
| `dividendTotal` | 누적 배당 수령액. |
| `donationTotal` | 누적 후원/코인 소각액. |
| `isBot` | 봇 계정 여부. 배당 지급 등에서 제외 조건으로 사용된다. |
| `isGuest` | 게스트 계정 여부. |

### Stock

`stocks`는 치지직 채널이자 거래 종목이다.

| 필드 | 설명 |
| --- | --- |
| `channelId` | 치지직 채널 ID, 종목 PK. |
| `streamerName`, `profileImageUrl`, `followerCount` | Chzzk API에서 가져오는 채널 메타데이터. |
| `currentPrice`, `basePrice`, `listingPrice` | 현재가, 일일 기준가, 상장가. 가격은 `DECIMAL(65,6)`. |
| `totalSupply` | 총 발행 가능 수량성 필드. |
| `issuedShares` | 현재 발행/유통 중인 수량성 필드. |
| `dailyVolume`, `dailyTradingValue` | 일일 거래량과 거래대금. 자정 리셋 대상. |
| `isLive`, `liveStartedAt` | 라이브 상태와 시작 시각. |
| `dividendAccumulationCount` | 몇 번째 1시간 배당까지 지급했는지 나타내는 카운터. |
| `preStreamFloat` | 라이브 시작 시점 전체 유통량 스냅샷. |
| `coinReserve`, `shareReserve` | AMM 풀 reserve. 가격은 `coinReserve / shareReserve`. |
| `feePool` | 거래 수수료 중 풀에 쌓이는 금액. |
| `liquidityTier` | AMM 초기 유동성 tier. |
| `tradingSuspended` | true면 거래 엔진에서 주문이 막힌다. |
| `createdAt`, `listedAt` | 생성/상장 시각. 신규 상장 제한에 사용된다. |

### Order

`orders`는 체결된 주문과 미체결 지정가 주문을 모두 표현한다.

| 필드 | 설명 |
| --- | --- |
| `id` | UUID 문자열. |
| `userId` | 주문자 Firebase UID. |
| `streamerId` | 종목 채널 ID. |
| `type` | `buy` 또는 `sell`. |
| `quantity` | 주문 수량. |
| `filledQuantity` | 지정가 주문의 부분 체결 수량. |
| `estimatedPrice` | 요청 시 추정가. 시장가 주문 기록과 지정가 보정에 쓰인다. |
| `executedPrice` | 실제 체결가. 미체결 주문은 null일 수 있다. |
| `status` | `completed`, `pending`, `cancelled`. |
| `orderMode` | `market` 또는 `limit`. |
| `limitPrice` | 지정가 주문 가격. |
| `allowPartial` | 부분 체결 허용 여부. |
| `expiresAt` | 지정가 만료 시각. |
| `createdAt`, `executedAt` | 생성 시각과 체결 시각. epoch milliseconds. |

### UserShare

`user_shares`는 사용자별 보유량과 배당 기준 수량을 관리한다.

| 필드 | 설명 |
| --- | --- |
| `shareId` | PK. |
| `user` | 사용자 FK. |
| `stock` | 종목 FK. |
| `quantity` | 현재 보유 수량. |
| `preStreamQuantity` | 라이브 시작 시점 보유량. 배당은 이 값 기준으로 지급된다. |
| `avgPrice` | 평균 매입 단가. |
| `updatedAt` | 마지막 수정 시각. |

매도 시 `quantity`가 줄어들면 `preStreamQuantity`도 현재 보유량보다 클 수 없도록 함께 줄인다. 즉 방송 시작 후 보유량을 팔았는데도 과거 스냅샷만으로 계속 배당을 받는 상황을 막는다.

### 로그/부가 테이블

| 테이블 | 설명 |
| --- | --- |
| `dividend_logs` | 종목별 배당 이벤트 로그. 전체 배당 피드에 사용된다. |
| `user_dividend_logs` | 사용자별 배당 수령 기록. 내 배당 내역에 사용된다. |
| `megaphone_posts` | 확성기 게시글. 라이브 세션 시작 시각을 함께 저장한다. |
| `stock_split_notices` | 특정 날짜/시간대의 분할 공지. 중복 실행 방지와 공지 조회에 사용된다. |
| `stock_split_events` | 종목별 분할 이벤트. 캔들 보정 등에 활용된다. |
| `titles`, `cheer_logs` | V49에서 생성된 테이블. 현재 JPA 엔티티는 없다. |

---

## 5. 요청 처리 공통 흐름

일반적인 API 요청은 아래 순서로 처리된다.

```text
Client
  -> HTTP request
  -> SecurityConfig filter chain
  -> FirebaseTokenFilter
     -> Bearer token 검증
     -> Firebase UID를 Authentication principal로 저장
     -> 사용자 role 계산
  -> Controller
     -> 요청 파라미터/본문 추출
     -> @AuthenticationPrincipal String uid 사용
  -> Application service
     -> 트랜잭션, 도메인 검증, repository 호출
  -> Repository/JPA
     -> MySQL 조회/저장
  -> 필요 시 WebSocket 발행
  -> HTTP response
```

컨트롤러는 복잡한 비즈니스 판단을 하지 않고, 대부분 service에 위임한다. 예외는 `400`, `401`, `404`, `409`, `422`, `429`, `500` 같은 HTTP 응답으로 변환된다.

---

## 6. 거래 시스템 상세

### 시장가 거래

시장가 거래는 `TradeController.trade()`가 `TradeEngine.submitTrade()`를 호출하면서 시작된다. 요청의 `userId`는 클라이언트 body를 신뢰하지 않고 인증 principal인 Firebase UID로 서버에서 덮어쓴다.

요청 예시:

```json
{
  "streamerId": "channelId",
  "type": "buy",
  "quantity": 10,
  "estimatedPrice": 10000
}
```

처리 흐름:

```text
1. 사용자 UID 확인
2. 사용자별 lock 획득
3. 종목 조회 및 tradingSuspended 확인
4. 주문 수량, 잔고, 보유량 검증
5. 신규 상장 anti-whale 정책 검증
6. AmmCalculator로 비용/수익/수수료/새 풀 상태 계산
7. User 잔고 갱신
8. UserShare 수량과 평균단가 갱신
9. Stock AMM reserve, 현재가, 일일 거래량/거래대금 갱신
10. Order 저장
11. 지정가 주문 매칭 가능 여부 확인
12. 트랜잭션 커밋 후 캐시 무효화와 WebSocket 발행
```

응답 예시:

```json
{
  "status": "executed",
  "executedPrice": 10500,
  "newBalance": 895000,
  "fee": 157,
  "orderId": "uuid",
  "orderMode": "market"
}
```

### AMM 계산 방식

AMM 계산은 `domain.trading.service.AmmCalculator`가 담당한다.

매수:

```text
cost = coinReserve * qty / (shareReserve - qty)
fee = ceil(cost * 1.5%)
userPays = cost + fee
newCoinReserve = coinReserve + cost
newShareReserve = shareReserve - qty
newPrice = newCoinReserve / newShareReserve
```

매도:

```text
revenue = coinReserve * qty / (shareReserve + qty)
fee = ceil(revenue * 1.5%)
userReceives = revenue - fee
newCoinReserve = coinReserve - revenue
newShareReserve = shareReserve + qty
newPrice = newCoinReserve / newShareReserve
```

수수료는 `{feePoolAmount, burnAmount}`로 나뉜다. `feePoolAmount`는 종목의 `feePool`에 누적되고, `burnAmount`는 사용자에게 돌아가지 않는 금액으로 계산된다.

### 지정가 주문과 취소

`Order`는 지정가 주문 필드를 가지고 있다.

- `orderMode = "limit"`이면 `limitPrice`, `allowPartial`, `expiresAt`, `filledQuantity`가 의미를 가진다.
- 체결되지 않은 주문은 `status = "pending"`으로 남는다.
- 주문이 체결되면 `executedAt`이 기록된다.
- 취소는 `POST /api/trade/cancel?orderId={id}`로 수행한다.

현재 문서 기준 컨트롤러는 거래 생성 요청을 `POST /api/trade` 하나로 받고, 내부에서 요청 필드에 따라 시장가/지정가 처리를 `TradeEngine`에 위임하는 구조다.

### 거래 후 실시간 발행

거래가 끝나면 대표적으로 아래 토픽이 발행된다.

| 토픽 | 내용 |
| --- | --- |
| `/topic/prices/{channelId}` | 해당 종목의 새 가격 |
| `/topic/trades` | 체결 요약 |
| `/topic/candles/{channelId}` | 갱신된 interval별 캔들 |
| `/topic/streamers` | 종목 목록/상태 갱신 |

---

## 7. 종목 등록과 Chzzk 연동

종목 등록은 Google role이 있는 사용자만 가능하다.

요청:

```json
{
  "channelUrl": "https://chzzk.naver.com/live/{channelId}"
}
```

`StockController`는 URL 또는 channelId 문자열을 받아 다음 형태를 모두 처리한다.

- `https://chzzk.naver.com/{channelId}`
- `https://chzzk.naver.com/live/{channelId}`
- `{channelId}`

처리 흐름:

```text
1. channelUrl 비어 있음 여부 확인
2. chzzk.naver.com URL이면 path에서 channelId 추출
3. channelId 형식과 길이 검증
4. StockService.addStockIfNew(uid, channelId)
5. ChzzkApiClient로 채널 정보 조회
6. 팔로워 수 조건 검증
7. 중복 종목 확인
8. 사용자 종목 추가권 차감
9. Stock 저장
10. /topic/streamers 발행
```

성공 응답:

```json
{
  "id": "channelId",
  "name": "스트리머명",
  "price": 10000.000000,
  "totalVolume": 100000,
  "message": "채널이 등록됐습니다."
}
```

오류 상황:

| Status | 조건 |
| --- | --- |
| `400` | URL 누락, 형식 오류, 티켓 부족 등 |
| `404` | Chzzk에서 채널을 찾지 못함 |
| `409` | 이미 등록된 채널 |
| `422` | 팔로워 수 조건 미달 |

---

## 8. 라이브 폴링과 배당

### 라이브 상태 폴링

`ChzzkLivePollingService.pollLiveStatus()`는 60초마다 실행된다.

```text
1. 등록된 종목을 조회
2. Chzzk API로 라이브 여부 확인
3. false -> true 전환이면 liveStartedAt 저장
4. 라이브 시작 시 모든 보유자의 UserShare.preStreamQuantity 저장
5. true -> false 전환이면 liveStartedAt과 dividendAccumulationCount 초기화
6. 상태가 바뀐 종목을 /topic/streamers로 발행
```

배당은 “지금 많이 샀는지”가 아니라 “라이브 시작 시점에 들고 있었는지”가 중요하다. 그래서 `preStreamQuantity` 스냅샷을 사용한다.

### 배당 지급

`ChzzkLivePollingService.payDueIntervalDividends()`는 1초마다 실행되며, 지급 예정 시간이 된 라이브 종목을 찾아 `DividendService.payIntervalDividend(stock)`를 호출한다.

배당 계산:

```text
ratePerShare = currentPrice * 0.0001
amount = preStreamQuantity * ratePerShare
```

예를 들어 현재가가 50,000원이고 라이브 시작 시점에 10주를 들고 있었다면, 1시간 배당은 `50,000 * 0.0001 * 10 = 50원`이다.

처리 흐름:

```text
1. 라이브 중이고 다음 배당 시간이 지난 종목 탐색
2. preStreamQuantity > 0인 보유자 조회
3. 봇 계정과 하우스 계정 제외
4. 사용자 잔고와 dividendTotal 증가
5. DividendLog 저장
6. UserDividendLog 저장
7. stock.dividendAccumulationCount 증가
8. 커밋 후 사용자 캐시 무효화
9. /topic/dividends와 /topic/user-dividends/{userId} 발행
```

배당 조회 API:

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/api/dividends/recent` | 로그인 | 최근 전체 배당 이벤트 30개 |
| GET | `/api/dividends/my` | 로그인 | 내 배당 수령 내역 50개 |

---

## 9. 주식 분할

주식 분할은 가격이 너무 커진 종목의 거래 가능성을 유지하기 위한 장치다.

조건:

- 스케줄: KST 00시, 06시, 12시, 18시
- 대상: `currentPrice > 1,000,000`
- 제외: `event-*` 종목
- 제외: 상장 후 24시간이 지나지 않은 종목
- 비율: 10:1

처리 흐름:

```text
1. 해당 splitDate/splitHour에 이미 공지가 있는지 확인
2. 분할 대상 종목 조회
3. Stock 가격 필드 /10
4. Stock 수량성 필드 *10
5. AMM shareReserve *10, coinReserve 유지
6. UserShare.quantity와 preStreamQuantity *10
7. UserShare.avgPrice /10
8. pending 지정가 주문 quantity *10, limitPrice/estimatedPrice /10
9. StockSplitNotice 저장
10. StockSplitEvent 저장
11. TradeEngine, CandleService 등 관련 캐시 무효화
12. /topic/streamers, /topic/prices/{channelId}, /topic/stock-split-notices 발행
```

분할 후에도 사용자의 평가액은 유지되는 것이 목표다.

```text
분할 전: 1주 * 1,500,000원 = 1,500,000원
분할 후: 10주 * 150,000원 = 1,500,000원
```

관리자는 `POST /api/admin/stock-split/force`로 수동 실행할 수 있다.

---

## 10. 포트폴리오, 랭킹, 프로필

### 포트폴리오

`GET /api/portfolio`는 현재 사용자 상태를 반환한다.

응답 예시:

```json
{
  "balance": 1000000,
  "shares": {
    "channelId": 10
  },
  "avgPrices": {
    "channelId": 10000.000000
  },
  "dividendTotal": 0,
  "remainingResets": 3
}
```

`POST /api/portfolio/reset`은 아래 조건을 모두 만족할 때만 가능하다.

- 보유 주식이 없어야 한다.
- 미체결 주문이 없어야 한다.
- KST 기준 하루 3회 이하만 가능하다.

초기화 시 잔고와 실현손익 같은 재무 상태가 초기값으로 돌아간다.

### 랭킹

`GET /api/rankings?type={type}`는 상위 50명을 반환한다.

| type | 기준 |
| --- | --- |
| `realized` | 실현 손익 |
| `dividend` | 누적 배당 |
| `donation` | 누적 후원 |

`rankingNicknamePublic=false`인 사용자는 랭킹에서 닉네임이 비공개로 표시된다.

### 프로필

| Method | Path | 설명 |
| --- | --- | --- |
| POST | `/api/profile/nickname` | 닉네임 변경권을 소모해 표시 이름 변경 |
| POST | `/api/profile/ranking-nickname-public` | 랭킹 닉네임 공개 여부 변경 |

---

## 11. 게스트와 계정 연결

게스트 생성은 abuse 방지를 위해 precheck와 register 두 단계로 나뉜다.

```text
POST /api/guest/precheck
  -> fingerprintHash와 request IP 기준으로 window 제한 확인
  -> 허용되면 precheckToken 반환

POST /api/guest/register
  -> Firebase 인증 principal(uid) 필요
  -> 신규 게스트면 precheckToken 검증/소비
  -> User가 없으면 isGuest=true 사용자 생성
  -> canonicalUid 반환
```

계정 연결 API:

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| POST | `/api/auth/link-google` | Google role | 기존 게스트 계정 데이터를 현재 Google 계정으로 병합 |
| POST | `/api/auth/upgrade-guest` | 로그인 | 현재 계정을 게스트가 아닌 등록 계정으로 표시 |

중요한 점은 서버의 사용자 식별 기준이 항상 Firebase UID라는 것이다. 클라이언트가 body에 임의 userId를 넣어도 거래/포트폴리오 같은 핵심 API는 인증 principal을 기준으로 처리한다.

---

## 12. 상점, 확성기, 후원

### 상점

`POST /api/shop/items/purchase`는 사용자의 잔고를 차감하고 티켓을 지급한다.

지원 아이템:

| item | 효과 |
| --- | --- |
| `nickname_ticket` | 닉네임 변경권 증가 |
| `stock_ticket` | 종목 추가권 증가 |

### 확성기

확성기는 라이브 중인 종목에 메시지를 노출하는 유료 기능이다.

조건:

- 로그인 필요
- 대상 종목이 라이브 중이어야 한다.
- 하루 사용 횟수 제한이 있다.
- 비용은 서비스 로직에서 차감한다.

주요 API:

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/shop/megaphone/posts` | 최근 확성기 게시글 |
| GET | `/api/shop/megaphone/my-uses-today` | 오늘 내 사용 횟수 |
| POST | `/api/shop/megaphone` | 확성기 사용 |

확성기 사용 후 `/topic/megaphone`으로 새 게시글이 발행된다.

### 후원

`POST /api/donate`는 사용자의 가상 원화를 소각하고 `donationTotal`을 증가시킨다.

요청 예시:

```json
{
  "amount": 1000
}
```

제약:

- 로그인 필요
- 최소 후원 금액은 1,000원
- 잔고 부족 시 실패
- 후원 금액은 랭킹 `type=donation`에 반영된다.

---

## 13. 인증과 보안 정책

`SecurityConfig`는 다음을 설정한다.

- CSRF 비활성화
- CORS 허용 origin 설정
- stateless session
- `FirebaseTokenFilter`를 `UsernamePasswordAuthenticationFilter` 앞에 추가

공개/인증 정책:

| 구분 | 경로 |
| --- | --- |
| 완전 공개 | `GET /health`, `/ws/**`, `GET /api/auth/me`, `/error`, `/og/**` |
| 공개 GET | `/api/stocks`, `/api/stocks/*/candles`, `/api/stocks/*/order-book`, `/api/orders/recent`, `/api/orders/history`, `/api/online-count`, `/api/rankings`, `/api/shop/megaphone/posts`, `/api/announcements/stock-splits/latest` |
| 공개 POST | `POST /api/guest/precheck` |
| Google role 필요 | `POST /api/auth/link-google`, `POST /api/stocks` |
| 관리자 API | `/api/admin/**`는 Security에서는 permitAll, 컨트롤러에서 `X-Admin-Key` 검증 |
| 로그인 필요 | 위 항목 외 모든 API |

관리자 API는 다음처럼 동작한다.

```text
1. SecurityConfig에서는 /api/admin/** 요청을 통과시킨다.
2. AdminController가 X-Admin-Key 헤더를 읽는다.
3. app.admin-api-key 설정값과 일치하지 않으면 401을 반환한다.
```

---

## 14. 주요 API 요약

### 인증/계정

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/api/auth/me` | 공개 | 현재 인증 상태 |
| POST | `/api/auth/link-google` | Google | 게스트 -> Google 병합 |
| POST | `/api/auth/upgrade-guest` | 로그인 | 게스트 상태 해제 |
| POST | `/api/guest/precheck` | 공개 | 게스트 등록 사전 검사 |
| POST | `/api/guest/register` | 로그인 | 게스트 사용자 등록 |

### 종목/거래

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/api/stocks` | 공개 | 전체 종목 |
| POST | `/api/stocks` | Google | 종목 등록 |
| GET | `/api/stocks/{id}/order-book?depth=10` | 공개 | 호가창 |
| GET | `/api/stocks/{id}/candles?interval=5m&count=50` | 공개 | 캔들 |
| POST | `/api/trade` | 로그인 | 주문 제출 |
| POST | `/api/trade/cancel?orderId={id}` | 로그인 | 주문 취소 |
| GET | `/api/orders` | 로그인 | 내 주문 |
| GET | `/api/orders/recent` | 공개 | 최근 전체 주문 |
| GET | `/api/orders/history?streamerId={id}` | 공개 | 종목별 주문 이력 |

### 사용자 기능

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/api/portfolio` | 로그인 | 포트폴리오 |
| POST | `/api/portfolio/reset` | 로그인 | 포트폴리오 초기화 |
| GET | `/api/rankings?type=realized` | 공개 | 랭킹 |
| POST | `/api/profile/nickname` | 로그인 | 닉네임 변경 |
| POST | `/api/profile/ranking-nickname-public` | 로그인 | 랭킹 닉네임 공개 설정 |
| POST | `/api/donate` | 로그인 | 후원 |

### 배당/상점/공지

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/api/dividends/recent` | 로그인 | 최근 배당 이벤트 |
| GET | `/api/dividends/my` | 로그인 | 내 배당 내역 |
| GET | `/api/shop/megaphone/posts` | 공개 | 확성기 글 목록 |
| GET | `/api/shop/megaphone/my-uses-today` | 로그인 | 오늘 내 확성기 사용 횟수 |
| POST | `/api/shop/megaphone` | 로그인 | 확성기 사용 |
| POST | `/api/shop/items/purchase` | 로그인 | 상점 아이템 구매 |
| GET | `/api/announcements/stock-splits/latest` | 공개 | 최신 분할 공지 |

### 운영/기타

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/health` | 공개 | 헬스체크 |
| GET | `/api/online-count` | 공개 | 접속자 수 |
| GET | `/og/stocks/{id}` | 공개 | 종목 OG HTML |
| GET | `/og/home` | 공개 | 홈 OG HTML |
| GET | `/sitemap.xml` | 공개 | 사이트맵 |
| POST | `/api/admin/amm/migrate` | `X-Admin-Key` | AMM 마이그레이션 |
| POST | `/api/admin/stock-split/force` | `X-Admin-Key` | 분할 강제 실행 |
| POST | `/api/admin/stocks/{channelId}/fix-amm?targetPrice={price}` | `X-Admin-Key` | AMM 가격 보정 |

---

## 15. WebSocket / STOMP

클라이언트는 SockJS endpoint `/ws`에 연결하고 STOMP topic을 구독한다.

| 설정 | 값 |
| --- | --- |
| SockJS endpoint | `/ws` |
| Simple broker prefix | `/topic` |
| Application destination prefix | `/app` |

주요 토픽:

| 토픽 | 발행 시점 | Payload 개념 |
| --- | --- | --- |
| `/topic/streamers` | 종목 등록, 라이브 상태 변경, 배당 tick, 일일 리셋, 주식 분할 | `Stock[]` |
| `/topic/prices/{channelId}` | 거래 체결, 주식 분할 | `{ streamerId, price }` |
| `/topic/trades` | 거래 체결 | 종목, 타입, 수량, 가격, 시간 |
| `/topic/candles/{channelId}` | 거래 발생 또는 라이브 분봉 tick | interval별 `OhlcCandle` |
| `/topic/dividends` | 배당 지급 | 전체 배당 이벤트 |
| `/topic/user-dividends/{userId}` | 특정 사용자 배당 지급 | 개인 배당 알림 |
| `/topic/megaphone` | 확성기 사용 | `MegaphonePost` |
| `/topic/online-count` | 접속자 수 변화 | `{ count }` |
| `/topic/rankings-reset` | 자정 랭킹 리셋 | `{ date }` |
| `/topic/stock-split-notices` | 주식 분할 실행 | `StockSplitNotice` |

실시간 발행은 트랜잭션 커밋 후 실행되는 경우가 많다. DB 저장이 실패했는데 클라이언트에는 성공 이벤트가 나가는 일을 줄이기 위해서다.

---

## 16. 스케줄러

| 클래스/메서드 | 주기 | 역할 |
| --- | --- | --- |
| `ChzzkLivePollingService.pollLiveStatus` | `fixedDelay=60_000` | Chzzk 라이브 상태 폴링 |
| `ChzzkLivePollingService.payDueIntervalDividends` | `fixedDelay=1_000` | 지급 예정 배당 처리 |
| `CandleService.broadcastLiveCurrentMinuteCandles` | 매분 0초 | 라이브 종목 현재 분봉 캔들 발행 |
| `DailyResetService.resetDaily` | 매일 00:00 KST | 기준가, 일일 거래량/거래대금, 랭킹 reset |
| `StockSplitService.performScheduledSplit` | 00/06/12/18시 KST | 고가 종목 10:1 분할 |
| `TradeEngine` 내부 정리 작업 | `fixedDelay=300_000` | 만료/미체결 주문 정리 |

스케줄러 thread pool은 `spring.task.scheduling.pool.size=6`으로 설정되어 있다.

---

## 17. 캐시와 동시성

코드에는 Redis와 Caffeine 의존성이 있고, 서비스 내부에서 조회 결과나 현재 캔들 같은 값을 캐싱한다. 캐시를 쓰는 이유는 다음과 같다.

- 종목 목록처럼 자주 읽히는 데이터를 매 요청마다 DB에서 가져오지 않기 위해
- 캔들 계산처럼 주문 이력 집계 비용이 큰 작업을 줄이기 위해
- 거래 후 포트폴리오/종목 상태가 즉시 반영되도록 필요한 시점에 명시적으로 무효화하기 위해

동시성에서 특히 중요한 부분은 거래다.

```text
동일 사용자가 동시에 여러 주문을 보내면
  -> 잔고/보유량 계산이 꼬일 수 있음
  -> TradeEngine은 사용자 단위 lock을 사용해 같은 사용자 주문을 직렬화
```

종목 가격과 AMM reserve는 거래마다 변하므로 트랜잭션과 저장 순서가 중요하다. 사용자 잔고, 보유량, 종목 reserve, 주문 이력은 한 거래 흐름 안에서 함께 갱신되어야 한다.

---

## 18. DB와 Flyway

Flyway 마이그레이션 위치:

```text
backend/src/main/resources/db/migration/
```

현재 총 62개 파일이 있으며 `V1`부터 `V62`까지 적용된다.

| 버전 | 주요 내용 |
| --- | --- |
| V1 | 초기 스키마 |
| V2-V7 | 초기 스트리머/종목 데이터와 스키마 정리 |
| V8-V10 | 주문 테이블, 일일 리셋/누락 컬럼 |
| V11-V15 | 상장 시각, 보유 평균단가, 평균단가 백필 |
| V16-V23 | 라이브/배당 시스템, 사용자별 배당 로그, 방송 시작 보유량 스냅샷 |
| V24-V28 | 지정가 주문 필드, 확성기, 발행량/유통량, 미사용 배당 풀 제거 |
| V29-V33 | 봇/닉네임/손익/랭킹 공개/상점 티켓/게스트 여부 |
| V34-V37 | 주문/보유/배당 성능 인덱스 |
| V38-V40 | 배당 금액 컬럼 확장, 확성기 라이브 세션, 상장가 |
| V41-V46 | 주식 분할 공지/이벤트, BIGINT 수량, 거래대금, 시간대별 공지 unique |
| V47-V50 | device_mappings 제거, 후원 누적, AMM/지정가 확장, 체결 시각 |
| V51-V52 | 가격 컬럼 BIGINT 확장과 오버플로우 복구 |
| V53-V55 | 주문 인덱스, 주문 가격/사용자 잔고 컬럼 확장 |
| V56 | 주요 숫자 컬럼을 최대 DECIMAL 계열로 확장 |
| V57 | AMM 풀 깊이 10배 스케일 |
| V58 | 음수 가격 추가 복구 |
| V59 | `stocks.trading_suspended` 추가 |
| V60 | `stocks` 숫자 필드를 소수 가격 지원 구조로 확장 |
| V61 | 일일 거래대금 수동 리셋 보정 |
| V62 | 소수 주가 지원 보강 |

숫자 타입은 서비스 특성상 매우 중요하다. 초기에는 `INT`/`BIGINT` 중심이었지만, 가격 폭등과 소수 가격 지원 때문에 V56 이후 넓은 `DECIMAL(65,x)` 계열로 확장되었다.

---

## 19. 설정 파일

### `application.yml`

주요 설정:

| 경로 | 설명 |
| --- | --- |
| `spring.datasource.*` | MySQL 연결 |
| `spring.jpa.hibernate.ddl-auto=validate` | JPA가 스키마를 만들지 않고 Flyway 결과와 매핑만 검증 |
| `spring.flyway.*` | 마이그레이션 위치와 baseline 설정 |
| `spring.data.redis.*` | Redis 연결 |
| `spring.task.scheduling.pool.size` | 스케줄러 thread pool |
| `server.port` | 서버 포트 |
| `app.cors-origin` | CORS 허용 origin 목록 |
| `app.admin-api-key` | 관리자 API용 키 |
| `app.firebase.service-account-path` | Firebase service account 파일 경로 |
| `app.guest-abuse.*` | 게스트 남용 방지 설정 |

기본값:

| 항목 | 기본값 |
| --- | --- |
| 서버 포트 | `${PORT:8080}` |
| CORS | `http://localhost:5173,http://localhost:3000` |
| DB | `jdbc:mysql://${DB_HOST:localhost}:${DB_PORT:3306}/${DB_NAME:spotchzxk}` |
| Redis | `localhost:6379` |
| Firebase service account | `serviceAccountKey.json` |

### `application-local.yml`

로컬 개발용 override다. 로컬 DB 계정, admin key, CORS origin 등이 들어 있다.

### 현재 남아 있는 설정 메모

`application.yml`에는 `bot.activity.*`, `system-sell.pressure.*` 설정이 남아 있지만 현재 코드 트리에는 대응 서비스 클래스가 없다. 과거 기능의 설정 잔재이거나 이후 복구/재구현 예정 설정으로 보인다.

---

## 20. 로컬 실행과 테스트

백엔드 디렉터리:

```text
backend/
```

실행:

```powershell
.\gradlew.bat bootRun
```

테스트:

```powershell
.\gradlew.bat test
```

주요 테스트 파일:

| 파일 | 확인 대상 |
| --- | --- |
| `TradeEnginePricingTest` | AMM 거래 가격/수수료/체결 로직 |
| `CandleServiceTest` | 캔들 집계와 캐시 |
| `ChzzkLivePollingServiceTest` | 라이브 폴링/배당 tick 흐름 |
| `MegaphoneServiceTest` | 확성기 사용 조건 |
| `SystemSellPressureServiceTest` | 과거/잔존 시스템 매도 압박 관련 테스트 |

테스트 리소스는 `backend/src/test/resources/application-test.yml`을 사용한다.

---

## 21. 백엔드 코드를 읽는 추천 순서

처음 백엔드를 이해하려면 아래 순서로 보는 것이 가장 빠르다.

1. `infrastructure/config/SecurityConfig.java`  
   어떤 API가 공개이고 어떤 API가 인증이 필요한지 먼저 파악한다.

2. `presentation/controller/TradeController.java`, `application/TradeEngine.java`  
   서비스의 핵심인 거래 흐름을 이해한다.

3. `domain/trading/service/AmmCalculator.java`  
   가격과 수수료가 어떻게 계산되는지 본다.

4. `domain/stock/entity/Stock.java`, `domain/user/entity/User.java`, `domain/user/entity/UserShare.java`, `domain/order/entity/Order.java`  
   거래가 어떤 DB 필드를 바꾸는지 확인한다.

5. `application/ChzzkLivePollingService.java`, `application/DividendService.java`  
   라이브와 배당 흐름을 이해한다.

6. `application/StockSplitService.java`  
   가격 폭등 시 분할로 시스템이 어떻게 안정화되는지 본다.

7. `presentation/controller/*Controller.java`  
   나머지 사용자 기능 API를 훑는다.

8. `backend/src/main/resources/db/migration/`  
   현재 DB 구조가 어떤 히스토리로 만들어졌는지 확인한다.

---

## 22. 주의할 점

- 클라이언트에서 전달한 userId를 신뢰하지 않는다. 핵심 API는 Firebase 인증 principal을 기준으로 처리한다.
- 가격/잔고/거래대금은 큰 수와 소수를 다루므로 `long`으로 단순 변환하면 안 된다. 현재 모델은 `BigDecimal`, `BigInteger`, `DECIMAL(65,x)`를 쓴다.
- 거래는 잔고, 보유량, 종목 AMM 풀, 주문 이력이 함께 바뀌므로 트랜잭션 경계가 중요하다.
- WebSocket 발행은 DB 커밋 후에 나가야 클라이언트 상태와 DB 상태가 어긋나지 않는다.
- 주식 분할은 종목뿐 아니라 사용자 보유량, 평균단가, 미체결 주문, AMM reserve, 캔들/가격 캐시까지 함께 고려해야 한다.
- `POST /api/guest/register`는 이름만 보면 공개 API처럼 보이지만 현재 Security 설정상 인증 principal이 필요하다.
- `/api/admin/**`는 Spring Security에서는 열려 있으므로 `X-Admin-Key` 검증이 실제 보호 장치다.
- 이 문서는 백엔드 전체 동작을 이해하기 위한 기준 설명서로 작성되어 있다.
