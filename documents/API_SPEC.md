# Spotchzxk API 명세서

작성일: 2026-05-25  
기준 코드: `backend/src/main/java/com/spotchzxk/controller`, `frontend/src/lib/api.ts`

## 기본 정보

- Base URL: `http://localhost:8080`
- API Prefix: `/api`
- WebSocket/SockJS Endpoint: `/ws`
- Content-Type: `application/json`
- 인증 방식: Firebase ID Token
  - 인증 필요 API는 요청 헤더에 `Authorization: Bearer {firebaseIdToken}`을 포함한다.
  - 게스트 등록, 헬스체크, 일부 공개 조회 API는 토큰 없이 호출할 수 있다.

## 공통 인증 정책

| 구분 | 정책 |
| --- | --- |
| 공개 | `GET /health`, `POST /api/guest/**`, `GET /api/auth/me`, `GET /api/stocks`, `GET /api/orders/recent`, `GET /api/orders/history`, `/ws/**` |
| Google 계정 필요 | `POST /api/stocks` |
| 로그인 필요 | 위 공개 API를 제외한 모든 API |

## 공통 에러 응답

구현상 일부 API는 빈 응답 본문을 반환할 수 있다.

```json
{
  "error": "에러 메시지"
}
```

| HTTP Status | 의미 |
| --- | --- |
| `400` | 잘못된 요청, 유효성 실패, 거래 실패 |
| `401` | 인증 필요 |
| `404` | 채널 또는 리소스 없음 |
| `409` | 이미 존재하는 종목 |
| `422` | 종목 등록 조건 미충족 |
| `429` | 포트폴리오 초기화 횟수 초과 |

## 인증 API

### GET `/api/auth/me`

현재 인증 상태를 확인한다.

인증: 선택

응답 예시:

```json
{
  "authenticated": true,
  "principal": "firebase-uid",
  "authorities": ["ROLE_GOOGLE"]
}
```

인증 정보가 없으면 `authenticated`가 `false`로 내려올 수 있다.

### POST `/api/auth/link-google`

게스트 계정을 현재 로그인된 Google 계정으로 병합한다.

인증: 필요

요청:

```json
{
  "guestUid": "guest-firebase-uid"
}
```

응답: `200 OK`, 본문 없음

## 게스트 API

### POST `/api/guest/register`

디바이스 지문과 Firebase UID를 매핑해 게스트 계정을 등록한다.

인증: 공개

요청:

```json
{
  "fingerprint": "device-fingerprint",
  "uid": "firebase-uid"
}
```

응답:

```json
{
  "uid": "firebase-uid"
}
```

## 종목 API

### GET `/api/stocks`

전체 종목 목록을 조회한다.

인증: 공개

응답:

```json
[
  {
    "channelId": "61f73be23ed1d1d650ba24f268570036",
    "streamerName": "스트리머명",
    "profileImageUrl": "https://...",
    "followerCount": 1000,
    "baseBroadcastHours": 0,
    "totalSupply": 100000,
    "dailyVolume": 20,
    "basePrice": 10000,
    "currentPrice": 10500,
    "isLive": false,
    "liveStartedAt": null,
    "dividendAccumulationCount": 0,
    "issuedShares": 20,
    "preStreamFloat": 0,
    "createdAt": "2026-05-25T12:00:00",
    "listedAt": "2026-05-25T12:00:00"
  }
]
```

### POST `/api/stocks`

치지직 채널을 종목으로 등록한다.

인증: Google 계정 필요

요청:

```json
{
  "channelUrl": "https://chzzk.naver.com/live/61f73be23ed1d1d650ba24f268570036"
}
```

`channelUrl`에는 치지직 채널 URL, 라이브 URL 또는 채널 ID를 넣을 수 있다.

성공 응답:

```json
{
  "id": "61f73be23ed1d1d650ba24f268570036",
  "name": "스트리머명",
  "price": 10000,
  "totalVolume": 100000,
  "message": "종목이 추가되었습니다."
}
```

에러:

| Status | 조건 |
| --- | --- |
| `400` | `channelUrl` 누락 또는 형식 오류 |
| `404` | 채널을 찾을 수 없음 |
| `409` | 이미 등록된 종목 |
| `422` | 팔로워 수 기준 미달 |

### GET `/api/stocks/{stockId}/candles`

종목의 OHLC 캔들 데이터를 조회한다.

인증: 필요

Query Parameters:

| 이름 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `interval` | string | `5m` | `1m`, `5m`, `1h`, `1d`, `1w` |
| `count` | number | `50` | 반환할 캔들 개수 |

응답:

```json
[
  {
    "bucketStart": 1779696000000,
    "open": 10000,
    "high": 10500,
    "low": 9900,
    "close": 10200
  }
]
```

## 거래 API

### POST `/api/trade`

시장가 매수 또는 매도 주문을 제출한다.

인증: 필요

요청:

```json
{
  "streamerId": "61f73be23ed1d1d650ba24f268570036",
  "type": "buy",
  "quantity": 10,
  "estimatedPrice": 10000
}
```

요청 필드:

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `streamerId` | string | 예 | 종목 채널 ID |
| `type` | string | 예 | `buy` 또는 `sell` |
| `quantity` | number | 예 | 1 이상 |
| `estimatedPrice` | number | 예 | 0.01 이상. 현재가 fallback 및 주문 기록에 사용 |

성공 응답:

```json
{
  "status": "executed",
  "executedPrice": 10500,
  "newBalance": 895000,
  "fee": 0,
  "orderId": "uuid",
  "orderMode": "market"
}
```

에러: 잔액 부족, 보유 수량 부족, 발행 한도 초과, 종목 없음 등은 `400`과 `error` 메시지로 반환된다.

## 주문 API

### GET `/api/orders`

내 주문 목록을 최신순으로 조회한다.

인증: 필요

응답:

```json
[
  {
    "id": "uuid",
    "userId": "firebase-uid",
    "streamerId": "61f73be23ed1d1d650ba24f268570036",
    "type": "buy",
    "quantity": 10,
    "estimatedPrice": 10000,
    "executedPrice": 10500,
    "status": "completed",
    "orderMode": "market",
    "limitPrice": null,
    "createdAt": 1779696000000
  }
]
```

### GET `/api/orders/recent`

최근 전체 주문 50개를 조회한다.

인증: 공개

응답: `Order[]`

### GET `/api/orders/history`

특정 종목의 주문 이력을 오래된 순으로 조회한다.

인증: 공개

Query Parameters:

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `streamerId` | string | 예 | 종목 채널 ID |

응답: `Order[]`

참고: 프론트엔드에는 `POST /api/trade/cancel?orderId={id}` 호출 코드가 있으나, 현재 백엔드 컨트롤러에는 해당 API 구현이 없다.

## 포트폴리오 API

### GET `/api/portfolio`

내 포트폴리오를 조회한다.

인증: 필요

응답:

```json
{
  "balance": 1000000,
  "shares": {
    "61f73be23ed1d1d650ba24f268570036": 10
  },
  "avgPrices": {
    "61f73be23ed1d1d650ba24f268570036": 10000
  },
  "dividendTotal": 0,
  "remainingResets": 3
}
```

### POST `/api/portfolio/reset`

내 포트폴리오를 초기화한다.

인증: 필요

성공 응답: `GET /api/portfolio`와 동일한 형태

제약:

- 보유 주식이 있으면 초기화할 수 없다.
- 미체결 주문이 있으면 초기화할 수 없다.
- KST 기준 하루 최대 3회까지 초기화할 수 있다.

초기화 횟수 초과 응답:

```json
{
  "error": "초기화 횟수 초과 메시지",
  "remainingResets": 0
}
```

## 배당 API

### GET `/api/dividends/recent`

최근 전체 배당 로그 30개를 조회한다.

인증: 공개

응답:

```json
[
  {
    "channelId": "61f73be23ed1d1d650ba24f268570036",
    "streamerName": "스트리머명",
    "profileImageUrl": "https://...",
    "totalDividendPool": 10000,
    "streamMinutes": 60,
    "createdAt": "2026-05-25T12:00:00"
  }
]
```

### GET `/api/dividends/my`

내 배당 수령 내역을 최신 50개 기준으로 조회한다. 금액이 0인 로그는 제외된다.

인증: 필요

응답:

```json
[
  {
    "channelId": "61f73be23ed1d1d650ba24f268570036",
    "streamerName": "스트리머명",
    "profileImageUrl": "https://...",
    "quantity": 10,
    "ratePerShare": 12.5,
    "amount": 125,
    "createdAt": "2026-05-25T12:00:00"
  }
]
```

## 상점 API

### GET `/api/shop/megaphone/posts`

최근 확성기 게시글 20개를 조회한다.

인증: 필요

응답:

```json
[
  {
    "id": "uuid",
    "userId": "firebase-uid",
    "channelId": "61f73be23ed1d1d650ba24f268570036",
    "streamerName": "스트리머명",
    "message": "메시지",
    "liveUrl": "https://chzzk.naver.com/live/61f73be23ed1d1d650ba24f268570036",
    "createdAt": "2026-05-25T12:00:00"
  }
]
```

### GET `/api/shop/megaphone/my-uses-today`

오늘 내 확성기 사용 횟수를 조회한다.

인증: 필요

응답:

```json
{
  "count": 1
}
```

### POST `/api/shop/megaphone`

라이브 중인 종목에 확성기를 사용한다.

인증: 필요

요청:

```json
{
  "channelId": "61f73be23ed1d1d650ba24f268570036",
  "message": "응원 메시지"
}
```

성공 응답: `MegaphonePost`

제약:

- 가격: `1,000,000,000`원
- 1일 최대 3회
- 현재 라이브 중인 종목에만 사용 가능
- `message`는 최대 100자 컬럼에 저장된다.

## 헬스체크

### GET `/health`

서버 상태를 확인한다.

인증: 공개

응답:

```text
ok
```

## WebSocket/STOMP

SockJS 엔드포인트: `/ws`  
Simple Broker Prefix: `/topic`  
Application Destination Prefix: `/app`

클라이언트는 STOMP로 아래 토픽을 구독한다.

### `/topic/streamers`

종목 목록이 갱신될 때 발행된다.

Payload: `Stock[]`

발행 시점:

- 신규 종목 등록
- 라이브 상태 폴링 갱신
- 일일 리셋 작업

### `/topic/prices/{channelId}`

특정 종목 가격이 갱신될 때 발행된다.

Payload:

```json
{
  "streamerId": "61f73be23ed1d1d650ba24f268570036",
  "price": 10500
}
```

### `/topic/trades`

거래 체결 시 발행된다.

Payload:

```json
{
  "streamerId": "61f73be23ed1d1d650ba24f268570036",
  "streamerName": "스트리머명",
  "type": "buy",
  "quantity": 10,
  "price": 10500,
  "timestamp": 1779696000000
}
```

### `/topic/candles/{channelId}`

캔들 갱신 시 발행된다.

Payload:

```json
{
  "1m": {
    "bucketStart": 1779696000000,
    "open": 10000,
    "high": 10500,
    "low": 9900,
    "close": 10200
  },
  "5m": {
    "bucketStart": 1779696000000,
    "open": 10000,
    "high": 10500,
    "low": 9900,
    "close": 10200
  }
}
```

키는 `1m`, `5m`, `1h`, `1d`, `1w` 중 갱신된 interval이다.

### `/topic/dividends`

배당 발생 시 발행된다.

Payload:

```json
{
  "channelId": "61f73be23ed1d1d650ba24f268570036",
  "streamerName": "스트리머명",
  "profileImageUrl": "https://...",
  "ratePerShare": 12.5,
  "streamMinutes": 0,
  "createdAt": "2026-05-25T12:00:00"
}
```

### `/topic/megaphone`

확성기 사용 시 발행된다.

Payload: `MegaphonePost`

### `/topic/orders/{userId}`

프론트엔드에서 구독하고 있으나, 현재 백엔드 코드에서 해당 토픽으로 발행하는 구현은 확인되지 않았다.

## 주요 데이터 모델

### Stock

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `channelId` | string | 치지직 채널 ID, 종목 ID |
| `streamerName` | string | 스트리머명 |
| `profileImageUrl` | string | 프로필 이미지 URL |
| `followerCount` | number | 팔로워 수 |
| `baseBroadcastHours` | number | 기준 방송 시간 |
| `totalSupply` | number | 총 발행 가능 수량 |
| `dailyVolume` | number | 일 거래량 |
| `basePrice` | number | 기준 가격 |
| `currentPrice` | number | 현재 가격 |
| `isLive` | boolean | 라이브 여부 |
| `liveStartedAt` | string/null | 라이브 시작 시각 |
| `dividendAccumulationCount` | number | 배당 누적 카운트 |
| `issuedShares` | number | 현재 발행 주식 수 |
| `preStreamFloat` | number | 방송 시작 시점 유통량 |
| `createdAt` | string | 생성 시각 |
| `listedAt` | string | 상장 시각 |

### Order

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | string | 주문 ID |
| `userId` | string | 사용자 UID |
| `streamerId` | string | 종목 채널 ID |
| `type` | string | `buy` 또는 `sell` |
| `quantity` | number | 수량 |
| `estimatedPrice` | number | 요청 시 추정 가격 |
| `executedPrice` | number/null | 체결 가격 |
| `status` | string | `completed`, `pending`, `cancelled` |
| `orderMode` | string | `market`, `limit` |
| `limitPrice` | number/null | 지정가 |
| `createdAt` | number | epoch milliseconds |

### MegaphonePost

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | string | 게시글 ID |
| `userId` | string | 사용자 UID |
| `channelId` | string | 종목 채널 ID |
| `streamerName` | string | 스트리머명 |
| `message` | string/null | 확성기 메시지 |
| `liveUrl` | string | 치지직 라이브 URL |
| `createdAt` | string | 생성 시각 |

## 구현 참고 사항

- 프론트엔드 기본 API 주소는 `VITE_API_BASE_URL`이 없으면 `http://localhost:8080`이다.
- 프론트엔드 기본 WebSocket 주소는 `VITE_WS_URL`이 없으면 `http://localhost:8080/ws`이다.
- `POST /api/trade`의 `userId`는 요청 본문 값이 아니라 인증된 Firebase principal로 서버에서 덮어쓴다.
- `GET /api/stocks/{stockId}/candles`는 보안 설정상 현재 인증 필요 API다.
- 제한 주문 관련 필드는 DB 모델에 존재하지만, 현재 컨트롤러 기준으로 생성/취소 API는 구현되어 있지 않다.
