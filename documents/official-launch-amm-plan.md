# 정식 배포 AMM 운영 계획

## 목적

정식 시즌은 베타 운영 중 누적된 초대형 자산과 AMM 풀 괴리를 초기화하고, 새 경제 규모에 맞는 AMM 파라미터로 시작한다. 베타의 V57/V58류 풀 스케일링은 기존 데이터 보정용이며, 정식 시즌의 기본 운영 방식으로 보지 않는다.

## 기본 전제

- 정식 시즌 시작 시 시장 데이터 초기화
- 초기 자본은 1,000만 코인 유지
- 베타 참여 보상으로 종목 추가권 지급 예정
- 신규 상장 24시간 초기 보호 장치 유지
- AMM reserve 및 feePool은 `DECIMAL(65,0)` / Java `BigInteger` 기준 유지

## 상장가

상장가 공식은 유지한다.

```text
listingPrice = sqrt(followerCount) * 300
최소 10,000
최대 300,000
1,000원 단위 내림
```

고팔로워 종목은 높은 상장가와 깊은 풀을 함께 가져가고, 저팔로워 종목은 낮은 상장가와 높은 변동성을 유지한다.

## 초기 AMM 풀

정식 시즌에서는 신규 상장 시 아래 티어 reserve를 적용한다.

| 티어 | 팔로워 수 | 추천 shareReserve |
|---|---:|---:|
| 1 | 2,000 미만 | 8,000 |
| 2 | 20,000 미만 | 12,000 |
| 3 | 200,000 미만 | 18,000 |
| 4 | 1,000,000 미만 | 30,000 |
| 5 | 1,000,000 이상 | 80,000 |

초기 풀은 다음 방식으로 생성한다.

```text
coinReserve = listingPrice * shareReserve
shareReserve = tierShareReserve
```

200주 시장가 매수 기준 대략적인 가격 상승률은 다음과 같다.

| 티어 | shareReserve | 200주 매수 상승률 |
|---|---:|---:|
| 1 | 8,000 | 약 5.2% |
| 2 | 12,000 | 약 3.4% |
| 3 | 18,000 | 약 2.3% |
| 4 | 30,000 | 약 1.3% |
| 5 | 80,000 | 약 0.5% |

## 신규 상장 보호

신규 상장 후 24시간 동안 유저별 초기 매집 제한을 유지한다.

```text
heldQty + pendingBuyQty + orderQty <= 200
```

이 제한은 가격 급등 방지보다 초기 독점 매집 방지가 목적이다. 가격 충격은 초기 AMM 풀 깊이와 슬리피지 가드로 제어한다.

## 자동 리밸런싱

정식 시즌에서는 자동 리밸런싱을 사용하지 않는다.

제거 이유:

- 현재가를 유지하면서 `coinReserve`를 새로 주입하면 출구 유동성을 인위적으로 생성할 수 있다.
- 펌핑 후 리밸런싱을 이용한 매도 전략이 생길 수 있다.
- 정식 경제에서는 풀 깊이 문제를 초기 reserve와 액면분할로 해결하는 편이 더 중립적이다.

정식 운영 원칙:

```text
자동 리밸런싱 없음
관리자 임의 풀 주입 없음
가격 상승 후 풀 깊이 증가는 액면분할로 처리
```

## 액면분할

액면분할은 장기적인 풀 깊이 안정장치로 유지한다.

```text
currentPrice / ratio
basePrice / ratio
listingPrice / ratio
totalSupply * ratio
issuedShares * ratio
preStreamFloat * ratio
user_shares.quantity * ratio
user_shares.preStreamQuantity * ratio
user_shares.avgPrice / ratio
shareReserve * ratio
coinReserve 유지
```

이 방식은 AMM 풀에 새 코인을 만들지 않고 거래 단위만 쪼개므로 경제적으로 중립적이다.

## 주문 처리 정책

주문 처리는 단순하게 유지한다.

```text
시장가/지정가 모두 전량 체결 또는 전량 거절
부분 체결 없음
자동 분할 체결 없음
```

복잡한 처리는 주문 전 예상 계산과 슬리피지 가드로 옮긴다.

시장가 주문:

- 프론트에서 AMM 예상 체결액과 평균단가 계산
- 백엔드에서 실제 AMM 계산 후 `maxCoinIn` / `minCoinOut` 검증
- 가드 초과 시 전량 거절

지정가 주문:

- 지정가가 가격 한도 역할을 한다.
- 체결 시점에 DB의 최신 AMM 풀로 재계산한다.
- 지정가 조건을 벗어나면 체결하지 않는다.

## 숫자 타입

AMM 관련 숫자는 큰 자산과 reserve를 안전하게 처리하기 위해 확장 타입을 유지한다.

DB:

```sql
coin_reserve  DECIMAL(65,0)
share_reserve DECIMAL(65,0)
fee_pool      DECIMAL(65,0)
```

백엔드:

```text
Stock.coinReserve  BigInteger
Stock.shareReserve BigInteger
Stock.feePool      BigInteger
AmmCalculator      BigInteger 기반 계산
```

프론트:

```text
coinReserve/shareReserve는 JSON 문자열로 수신
주문 예상 계산은 BigInt 기반
```

JS `number`로 reserve를 파싱하면 큰 값에서 정밀도가 깨지므로 reserve는 문자열로 유지한다.

## 베타 보정과 정식 운영의 구분

베타 운영:

- 기존 자산이 매우 커져 일부 종목의 `issuedShares / shareReserve` 괴리가 극단적으로 커짐
- V57 및 필요 시 V58로 기존 풀을 선별 스케일링
- 목적은 베타 유저의 거래 불편 완화

정식 운영:

- 시장 초기화 후 새 티어 reserve로 시작
- 기존 베타 괴리 데이터를 끌고 가지 않음
- V57/V58식 보정은 정식 기본 운영 정책이 아님

## 정식 배포 전 체크리스트

- `AmmMigrationService.calcTierShareReserve`를 정식 추천값으로 변경
- `StockService` 신규 상장 초기화가 새 reserve를 사용하는지 확인
- 자동 리밸런싱 코드가 제거된 상태인지 확인
- `stocks.coin_reserve`, `share_reserve`, `fee_pool`이 `DECIMAL(65,0)`인지 확인
- 프론트 reserve 타입이 문자열이고 주문 예상 계산이 BigInt 기반인지 확인
- 신규 상장 24시간 200주 제한이 누적 기준으로 동작하는지 확인
- 정식 초기화 SQL 또는 초기화 절차에서 기존 베타 보유량/주문/배당 로그 처리 범위 확정

## 정식 추천 코드 값

```java
public static long calcTierShareReserve(long followerCount) {
    if (followerCount < 2_000)     return 8_000L;
    if (followerCount < 20_000)    return 12_000L;
    if (followerCount < 200_000)   return 18_000L;
    if (followerCount < 1_000_000) return 30_000L;
    return 80_000L;
}
```
