# AMM 풀 / 배당 로직 개편 계획서

## 배경

- 신규 상장 종목의 가격 변동폭이 과도하고 AMM 풀 초과 오류 빈발
- 배당이 코인을 무에서 생성하는 인플레이션 구조
- 매수만 하고 매도하지 않는 사용자 행동 패턴으로 풀이 점점 얇아지는 문제

## 확정 설계

### 기본 전제

- 정식 출시 기준 초기 자본: **1,000만 코인**
- 액면분할 기준: **현재가 100만원 도달 시 10:1 분할**

---

## 1. AMM 풀 초기화 개편

### 티어 구조 변경 (4티어 → 5티어)

| 티어 | 팔로워 수 | shareReserve | 전액(1000만) 투자 시 상승폭 |
|---|---|---|---|
| 1 | ~ 2,000 | 3,000주 | ~150% |
| 2 | ~ 20,000 | 5,000주 | ~66% |
| 3 | ~ 200,000 | 12,000주 | ~25% |
| 4 | ~ 1,000,000 | 30,000주 | ~9% |
| 5 | 1,000,000+ | 80,000주 | ~3% |

- `coinReserve = listingPrice × shareReserve`
- 상장가는 기존 `sqrt(followerCount) × 300` 공식 유지 (최솟값 10,000 / 최댓값 300,000)
- 같은 주수 매수 시 티어가 높을수록 가격 충격 작아짐
- 상장가가 비싼 종목은 코인 기준으로도 자연스럽게 안정적

### 수정 파일

**`AmmMigrationService.java`**

```java
// calcLiquidityTier
if (followerCount < 2_000)       return 1;
if (followerCount < 20_000)      return 2;
if (followerCount < 200_000)     return 3;
if (followerCount < 1_000_000)   return 4;
return 5;

// calcTierShareReserve — initialPrice 파라미터 제거, 고정값으로 교체
public static long calcTierShareReserve(int followerCount) {
    if (followerCount < 2_000)       return 3_000L;
    if (followerCount < 20_000)      return 5_000L;
    if (followerCount < 200_000)     return 12_000L;
    if (followerCount < 1_000_000)   return 30_000L;
    return 80_000L;
}

// calcPumpCostTarget 메서드 삭제
```

**`StockService.java` (L118)**

```java
// 기존
long shareReserve = AmmMigrationService.calcTierShareReserve(stock.getFollowerCount(), listingPrice);

// 변경
long shareReserve = AmmMigrationService.calcTierShareReserve(stock.getFollowerCount());
```

---

## 2. AMM 자동 리밸런싱

### 설계

- **트리거**: 현재가가 상장가의 **10배** 도달 시
- **동작**: shareReserve를 티어 기준값으로 복구, coinReserve는 `현재가 × targetShareReserve`로 신규 생성
- **상한 없음**: 100배(100만원) 도달 시 10:1 액면분할이 자연 리셋 역할
- 리밸런싱 생성 코인은 AMM 풀에 고정 → 유통되지 않아 인플레 영향 최소

```
티어1 예시:
상장가 10,000 → 10배 = 100,000 도달 시 리밸런싱
  shareReserve: (고갈된 값) → 3,000 복구
  coinReserve:  100,000 × 3,000 = 300,000,000 (코인 생성)
  가격 유지, 풀 깊이만 회복

이후 100만원 도달 시 10:1 분할
  shareReserve × 10, 가격 ÷ 10 → 자연 리밸런싱
```

### 수정 파일

**`Stock.java`** — 메서드 추가

```java
public boolean rebalancePoolIfNeeded(long targetShareReserve) {
    if (currentPrice < listingPrice * 10) return false;
    if (shareReserve >= targetShareReserve) return false;
    this.coinReserve = currentPrice * targetShareReserve;
    this.shareReserve = targetShareReserve;
    return true;
}
```

**`TradeEngine.java`** — `updateStock` 내 save 전에 추가

```java
private void updateStock(Stock stock, boolean isBuy, long qty,
                         AmmCalculator.AmmResult amm, BigDecimal userNet) {
    stock.applyAmmTrade(amm.newPool()[0], amm.newPool()[1], amm.feePoolAmount());
    stock.applyTrade(amm.newPrice().longValue(), isBuy, qty, userNet.longValue());

    long targetReserve = AmmMigrationService.calcTierShareReserve(stock.getFollowerCount());
    if (stock.rebalancePoolIfNeeded(targetReserve)) {
        ammPoolCache.remove(stock.getChannelId());
    }

    stockRepository.save(stock);
}
```

---

## 3. 배당 로직 개편

### 설계

| 항목 | 기존 | 변경 |
|---|---|---|
| 코인 출처 | 무에서 생성 | feePool에서 지급 |
| 계산 기준 | 현재가 × 0.01% × 보유량 | feePool × 35% ÷ eligibleShares |
| 배당 대상 | preStreamQty 보유자 | 유지 |
| 배당 조건 | 방송 중 1시간 인터벌 | 유지 |
| feePool 고갈 시 | 해당 없음 | 배당 없음 (방송 중이어도) |

### feePool 흐름

```
거래 발생
├─ ammAmount의 1%  → feePool 적립
└─ ammAmount의 0.5% → 소각 (기존 유지)

방송 중 매 시간
└─ feePool × 35% → preStreamQty 비례 분배 후 feePool 차감

방송 종료
└─ feePool 잔고 이월 (소각 없음)
```

### 기대 효과

- 거래가 활발한 종목 = feePool 많음 = 배당 많음
- 거래 없는 종목 = feePool 없음 = 배당 없음
- 가격 급등 → 배당 급증 나선형 인플레이션 구조 해소
- 액면분할 시 중립 (주수 2배, 주당 배당 절반, 수령액 동일)

### 수정 파일

**`DividendService.java`**

```java
// 상수 변경
private static final BigDecimal FEE_POOL_PAYOUT_RATIO = new BigDecimal("0.35");

// payIntervalDividend 계산 로직 교체
long feePool = stock.getFeePool();
if (feePool <= 0) return; // feePool 없으면 배당 없음

BigDecimal totalPayout = BigDecimal.valueOf(feePool)
    .multiply(FEE_POOL_PAYOUT_RATIO)
    .setScale(0, RoundingMode.FLOOR);

BigDecimal ratePerShare = totalPayout
    .divide(BigDecimal.valueOf(eligibleShares), 4, RoundingMode.FLOOR);

// 배당 지급 후 feePool 차감 (트랜잭션 내)
stock.drainFeePool(totalPayout.longValue());
stockRepository.save(stock);
```

---

## 수정 파일 요약

| 파일 | 변경 내용 |
|---|---|
| `AmmMigrationService.java` | 티어 5개로 확장, `calcTierShareReserve` 고정값으로 교체, `calcPumpCostTarget` 삭제 |
| `StockService.java` | `calcTierShareReserve` 호출부 인자 수정 |
| `Stock.java` | `rebalancePoolIfNeeded` 메서드 추가 |
| `TradeEngine.java` | `updateStock`에 리밸런싱 트리거 추가, ammPoolCache 무효화 |
| `DividendService.java` | 배당 계산 로직 전면 교체, feePool 차감 추가 |
