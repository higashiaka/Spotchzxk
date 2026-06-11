# 코드 오류 목록

> 분석 일자: 2026-06-11
>
> 우선순위 기준: **긴급** = 현재 사용자가 실제로 겪는 문제 / **높음** = 서버 오류·데이터 손상 가능 / **중간** = UX·성능·간헐적 오류 / **낮음** = 코드 품질·잠재적 문제

### ✅ 해결 완료 (2026-06-11)

> 총 **10개 항목 처리됨**: #1/2/3/4/5/8/13/28/29/34/44

| # | 항목 |
|---|------|
| 1, 2 | OrderForm.tsx — 프론트 시장가 예상가/maxBuy를 백엔드 AMM x*y=k + 1.5% 수수료 기준으로 변경 |
| 3 | AnnouncementPopup.tsx — 공지별 세션 닫기(`sessionDismissed`) 처리로 수정 |
| 4 | 영어 오류 메시지 — 거래/프로필/종목추가/상점/계정연동 주요 노출 메시지 한국어 변환 |
| 5 | CandleController.java — `listedAt == null` NPE 방어 |
| 8 | ChzzkLivePollingService.java — 개별 종목 예외가 전체 폴링 사이클 중단하지 않도록 수정 |
| 13 | MegaphoneService.java — 빈 메시지 NPE 대신 한국어 오류로 거절 |
| 28 | UserShareRepository.java — 게스트 배당 합계 불일치 수정 |
| 29 | DividendController.java — `createdAt null` 방어 |
| 34 | CandleService.java — `broadcastTrade()`에서 `candleService.onTrade()`를 `CompletableFuture.runAsync()`로 비동기화, stock 락 밖에서 실행돼 체결 지연 문제 제거 (기존 코드에 이미 적용돼 있었음) |
| 44 | DividendService.java — 방송 중 전량 매도자 배당 로그 및 개인 알림 누락 수정 |

### 📋 재검증으로 위험도 조정

| # | 내용 |
|---|------|
| 6 | DonationController — 현재 코드에 이미 null 금액 방어 존재 → 문서 설명과 다름, 실질 위험 없음 |
| 7 | ChzzkLivePollingService `payDueIntervalDividends` — 현재 코드가 `TransactionTemplate`으로 감싸고 있어 `@Transactional` 누락 위험이 직접 적용되지 않음 → 실질 위험 낮음 |

### 🔎 다음 검토 우선순위

| 순서 | 항목 | 이유 |
|------|------|------|
| 1 | #9, #10, #11 `frontend/src/hooks/useTrade.ts` | 낙관적 업데이트/슬리피지 보호가 실제 주문 UX와 중복 주문 방지에 직접 영향 |
| 2 | #12 `backend/.../service/TradeEngine.java` | 지정가 예약금과 실제 수수료 포함 비용 기준 불일치 가능성 |
| 3 | #30 `backend/src/main/resources/db/migration/` | 주문 목록 조회 성능 저하 가능성이 명확하고 인덱스로 해결 가능 |
| 4 | #34 `backend/.../service/CandleService.java` | synchronized 락 안 STOMP I/O 가능성으로 체결 지연 위험 |
| 5 | #15, #16, #17 | 스레드 안전성/트랜잭션 커밋 전 캐시 무효화 계열 |
| 6 | #37 `backend/.../config/FirebaseConfig.java` | 서버 기동 후 파일 스트림 누수 가능성 |
| 7 | #42, #43 | precheck token/account merge TOCTOU 보안성 검토 필요 |

---

## 긴급 — 사용자가 현재 겪고 있는 문제

현재 긴급 미처리 항목 없음. 기존 #1, #2, #3, #4는 해결 완료 섹션으로 이동.

### #1, #2 상세 분석: maxBuy 차이 규모

**근본 원인:** 프론트 모델은 `1.0005^qty` 지수함수라 수량이 커질수록 비용이 폭발적으로 증가한다고 가정함. 반면 백엔드 AMM은 풀이 깊을수록 슬리피지가 거의 없음 (특히 액면분할 후 `shareReserve`가 10배씩 커지므로 풀이 매우 깊어짐).

**수식 비교:**
- 프론트 maxBuy: `ln(1 + balance / (2001 × price)) / 0.0004999`  (로그 스케일로 수렴)
- 백엔드 실제 maxBuy: `≈ balance / (price × 1.015)` (선형)

**실제 배율 (잔고 10,000,000원 기준):**

| 현재가 | 프론트 maxBuy | 백엔드 실제 maxBuy | 배율 |
|--------|-------------|-----------------|------|
| 1,000원 | ~3,570주 | ~9,852주 | **약 2.8배** |
| 100원 | ~6,390주 | ~98,522주 | **약 15배** |
| 10원 | ~11,400주 | ~985,222주 | **약 86배** |
| 1원 | ~17,043주 | ~9,852,216주 | **약 578배** |

> 현재가 1원은 비현실적으로 보이나, 초기 상장가 100만원 종목이 10:1 분할 6회 반복 후 도달 가능한 값임.
> 잔고가 100,000,000원이면 1원 종목에서 **약 4,552배** 차이 발생.

**수정 방향:** 프론트에서 백엔드와 동일한 AMM 공식 구현, 또는 서버에 `maxBuy` 계산 API 엔드포인트 추가.

---

## 높음 — 서버 오류·데이터 손상 가능

| # | 파일 | 줄 | 내용 |
|---|------|----|------|
| 12 | `backend/.../service/TradeEngine.java` | 207-218 | `calcAmmTradeForLimit()`: 예약금(`limitPrice * qty`, 수수료 제외)과 실제 비용(`userNetAmount`, 수수료 포함) 비교 기준 불일치 |
| 30 | `backend/src/main/resources/db/migration/` | V34, V37 | `orders` 테이블에 `(user_id, status, created_at)` 복합 인덱스 없음 → `findByUserIdAndStatusOrderByCreatedAtDesc` 호출 시 풀 스캔 |
| 34 | `backend/.../service/CandleService.java` | 84-96 | `onTrade()`, `evictStockCache()` 모두 `synchronized` → `messagingTemplate.convertAndSend()` (STOMP 네트워크 I/O)를 락 보유 중 실행. 다수 종목 동시 체결 시 모든 거래 스레드가 이 락에서 블로킹돼 체결 지연 가능 |

---

## 중간 — UX·성능·간헐적 오류

| # | 파일 | 줄 | 내용 |
|---|------|----|------|
| 9 | `frontend/src/hooks/useTrade.ts` | 42-65 | Optimistic update 잔고 차감 시 수수료 미반영 (`estimatedPrice * qty` 사용) → 잔고 표시 일시적 불일치 |
| 10 | `frontend/src/hooks/useTrade.ts` | 43-68 | 지정가 주문 제출 시 낙관적 업데이트 완전 스킵 → 예약금 차감이 UI에 미반영, 3.5초 대기 중 중복 주문 가능 |
| 11 | `frontend/src/hooks/useTrade.ts` | — | `TradeRequest`에 `maxCoinIn`/`minCoinOut` 미전송 → 슬리피지 보호 미작동 |
| 14 | `backend/.../service/PortfolioService.java` | 52-59 | `s.getStock()` Lazy 로딩으로 N+1 쿼리 발생 (JOIN FETCH 메서드 있으나 미사용) |
| 15 | `backend/.../service/system/SystemSellPressureService.java` | 319-334 | `PressureState` 필드 `volatile`/`AtomicInteger` 혼용 → 스레드 안전성 불일치 |
| 16 | `backend/.../service/DailyResetService.java` | 33-54 | 캐시 무효화가 트랜잭션 내부에서 실행 → 커밋 전 다른 스레드가 구식 캐시 재로드 가능 |
| 17 | `backend/.../service/PortfolioService.java` | 84-117 | `resetPortfolioLocked()` 내 `evictUserCache()`가 트랜잭션 내부 호출 → 동일 문제 |
| 18 | `frontend/src/lib/stompClient.ts` | 50-66 | STOMP 연결 진행 중 `unsubscribe()` 호출 시 `subscription`이 null → 구독 해제 누락·메모리 누수 가능 |

---

## 낮음 — 코드 품질·잠재적 문제

| # | 파일 | 줄 | 내용 |
|---|------|----|------|
| 19 | `backend/.../entity/Order.java` | 55-62 | `filledQuantity`, `allowPartial` 필드가 DB 스키마에 있으나 부분 체결 로직 미구현 |
| 20 | `backend/.../service/ChzzkLivePollingService.java` | 139-148 | `markStreamStarted()` 트랜잭션 없이 실행 → 스냅샷·합계 계산 사이 매매 발생 시 `preStreamFloat` 부정확 |
| 21 | `backend/.../entity/Stock.java` | 191-193 | `splitPrice()`에서 `double` 반올림 정밀도 손실 (BigDecimal 권장) |
| 22 | `backend/.../config/GuestAbuseProperties.java` | 7-28 | Record compact constructor에서 `trustedProxyCidrs` 재할당이 필드에 미반영될 수 있음 |
| 23 | `backend/.../config/SecurityConfig.java` | 36 | CSRF 완전 비활성화 (Stateless API이므로 실질 위험 낮으나 WebSocket 사용 시 검토 필요) |
| 24 | `frontend/src/components/order/OrderForm.tsx` | 113-124 | `handleSubmit` 클로저가 렌더 시점 `currentPrice` 캡처 → 수량 변경 중 가격 변동 시 구형 가격으로 주문 전송 가능 |
| 25 | `backend/.../repository/DividendLogRepository.java` | 12 | `findTop30ByOrderByCreatedAtDesc()` — JOIN FETCH 없이 LAZY Stock 접근 → 최대 30×3 필드 = 90개 추가 쿼리 발생 |
| 26 | `backend/.../service/PortfolioService.java` | 119-125 | `cachedLeagueRank()` read→write 비원자적 — 동시 요청 시 캐시 미스 중복 발생, DB 쿼리 n중 실행 |
| 27 | `frontend/src/utils.ts` | 5 | `INITIAL_BALANCE = 1_000_000` 선언됐으나 아무 곳에서도 import 안 됨 (dead code) + 백엔드 실제값 10,000,000과 불일치 |
| 31 | `frontend/src/hooks/useDividends.ts` | 37-44 | STOMP 배당 메시지 수신 시 JSON 파싱 후 필드 검증 없음 → 잘못된 메시지 수신 시 렌더 크래시 가능 |
| 32 | `frontend/src/components/profile/ProfileView.tsx` | 429-430 | `new Date(d.createdAt)` null/undefined 처리 없음 → Invalid Date → `getMonth()` NaN → 표시 오류 |
| 33 | `frontend/src/components/prices/StockDetail.tsx` | 131-148 | 주문 내역 API 실패 시 `.catch(() => {})` silent swallow → 사용자에게 오류 미표시, 빈 목록으로 렌더 |
| 35 | `frontend/src/components/home/HomeView.tsx` | 402 | `new Date(item.createdAt)` — `item: any` 타입으로 null 체크 없음 → `createdAt` 누락 시 Invalid Date → `getMonth()` NaN → 시간 표시 오류 (#32와 동일 패턴, 다른 파일) |
| 36 | `frontend/src/components/home/HomeView.tsx` | 347, 403 | `d.getHours()` 제로패딩 없음, `d.getMinutes()`는 `padStart(2,'0')` 적용됨 → 시간 표시 불일치 (예: "9:05" 대신 "09:05"). 거래 피드·주문 내역 두 곳 모두 해당. `ProfileView.tsx:430`은 이미 수정돼 있음 |
| 37 | `backend/.../config/FirebaseConfig.java` | 30-34 | `new FileInputStream(file)` 후 `try-with-resources` 없음 → `GoogleCredentials.fromStream()`이 스트림을 닫지 않으므로 서버 기동 후 파일 디스크립터가 영구 누수됨 |
| 38 | `backend/.../service/AmmCalculator.java` | 107 | `calcSell()`의 avgPrice가 `ammRevenue`(fee 차감 전) 기준 → `calcBuy()`는 `userPays`(fee 포함) 기준이라 일관성 없음. 매도 체결 단가가 실제 수령액보다 ~1.5% 과대 표시됨 |
| 39 | `frontend/src/components/chart/chartUtils.ts` | 25 | 일봉/주봉 레이블에 `getMonth()`/`getDate()` (로컬 타임존) 사용 → 1m/5m/1h는 `getUTCHours()` 사용 중. UTC+9 서버 기준 자정 캔들이 한국 이외 유저에게 날짜 오표기 가능 |
| 40 | `frontend/src/components/order/OrderView.tsx` | 37-41 | 동일 종목을 닫았다가 다시 선택하면 `selectedStreamer.id === prevId` 조건으로 수량 리셋 스킵 → 이전 수량이 그대로 유지됨. `selectedStreamer`가 null이 될 때 `prevId`도 함께 초기화해야 함 |
| 41 | `frontend/src/App.tsx` | 251-267 | `pendingGuestMerge` localStorage 키를 API 요청 성공 후에 제거 → auth 상태가 빠르게 두 번 발생하면 merge 요청이 중복 전송될 수 있음 (서버 409 처리로 부분 완화되나, 요청 전 동기 삭제가 더 안전) |
| 42 | `backend/.../service/GuestAbuseProtectionService.java` | 97-101 | `consumePrecheckPermit()` Redis 경로에서 `get(key)` → `delete(key)` 비원자적 실행 → 동일 토큰으로 동시 요청 2건이 모두 `get`을 통과한 후 한 건만 `delete`하면 같은 precheck 토큰으로 중복 가입 가능 (TOCTOU). Lua 스크립트 또는 `getAndDelete()`로 원자화 필요 |
| 43 | `backend/.../service/AccountLinkService.java` | 37-59 | `mergeGuestIntoGoogle()` 내 `existsById(googleUid)` 통과 후 `save()` 사이 트랜잭션 경계 없음 → 두 요청이 동시에 체크를 통과하면 두 번째 `save()`에서 PK 중복 예외(500) 발생. 의도한 409 대신 500 반환. `@Transactional` 있으나 `READ_COMMITTED`에서는 두 트랜잭션 모두 체크 통과 가능 |

---

## 영어 오류 메시지 한국어 변환 필요 목록

> `TradeController` 등에서 `e.getMessage()`를 그대로 응답 반환 → 사용자에게 영어 원문 노출.
> `SystemSellPressureProperties` 오류는 서버 기동 시 설정 검증용이므로 제외.

### 거래 (`AmmCalculator`, `TradeEngine`)

| 파일 | 줄 | 현재 메시지 | 제안 한국어 메시지 |
|------|----|------------|-------------------|
| `AmmCalculator.java` | 24 | `Quantity must be positive.` | `주문 수량은 1주 이상이어야 합니다.` |
| `AmmCalculator.java` | 25 | `Order quantity exceeds pool depth.` | `주문 수량이 AMM 풀의 유동성을 초과합니다. 수량을 줄여주세요.` |
| `TradeEngine.java` | 127 | `Order not found.` | `존재하지 않는 주문입니다.` |
| `TradeEngine.java` | 130 | `Order is not pending.` | `이미 체결되었거나 취소된 주문입니다.` |
| `TradeEngine.java` | 190 | `Limit price is required.` | `지정가 주문에는 가격을 입력해야 합니다.` |
| `TradeEngine.java` | 223 | `Slippage exceeds limit price.` | `현재 시장가가 지정가보다 높아 체결할 수 없습니다.` |
| `TradeEngine.java` | 285, 325 | `Insufficient shares.` | `보유 주식이 부족합니다.` |
| `TradeEngine.java` | 291, 455 | `Insufficient balance.` | `잔고가 부족합니다.` |
| `TradeEngine.java` | 306, 318 | `Issued share limit exceeded.` | `해당 종목의 최대 발행 한도에 도달했습니다.` |
| `TradeEngine.java` | 412, 421 | `User not found.` | `사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.` |

### 프로필 (`ProfileService`)

| 파일 | 줄 | 현재 메시지 | 제안 한국어 메시지 |
|------|----|------------|-------------------|
| `ProfileService.java` | 20 | `Display name is required.` | `닉네임을 입력해주세요.` |
| `ProfileService.java` | 23 | `Display name can be at most 8 characters.` | `닉네임은 최대 8자까지 입력할 수 있습니다.` |
| `ProfileService.java` | 27 | `Display name can only contain Korean, English letters, and numbers.` | `닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.` |
| `ProfileService.java` | 34, 37 | `No nickname-change ticket available.` | `닉네임 변경권이 없습니다.` |
| `ProfileService.java` | 46 | `User not found.` | `사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.` |

### 종목 추가 (`StockService`)

| 파일 | 줄 | 현재 메시지 | 제안 한국어 메시지 |
|------|----|------------|-------------------|
| `StockService.java` | 106, 109 | `No stock-add ticket available.` | `종목 추가권이 없습니다.` |

### 상점 (`ShopItemService`)

| 파일 | 줄 | 현재 메시지 | 제안 한국어 메시지 |
|------|----|------------|-------------------|
| `ShopItemService.java` | 39 | `Unknown item.` | `존재하지 않는 상품입니다.` |
| `ShopItemService.java` | 43 | `Insufficient balance.` | `잔고가 부족합니다.` |
| `ShopItemService.java` | 47, 53, 56 | `User not found.` | `사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.` |

### 기타

| 파일 | 줄 | 현재 메시지 | 제안 한국어 메시지 |
|------|----|------------|-------------------|
| `MegaphoneService.java` | 74 | `User not found.` | `사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.` |
| `Stock.java` | 178 | `Split ratio must be greater than 1.` | `액면분할 비율은 2 이상이어야 합니다.` (관리자용, 노출 가능성 낮음) |
| `AccountLinkService.java` | 78 | `User not found.` | `사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.` |

---

## 개선 계획

### 1. 액면분할 공지 닫기 버그 수정

**파일:** `frontend/src/components/AnnouncementPopup.tsx`

`visible: boolean` → `sessionDismissed: string[]` 교체. 각 공지 ID를 개별적으로 닫을 수 있게 함.

```ts
// 변경 전
const [visible, setVisible] = useState(true);

const activeAnnouncement = useMemo(() =>
  candidates.find(a => localStorage.getItem(a.id) !== 'hidden') ?? null
, [stockSplitAnnouncement]);

if (!visible || !activeAnnouncement) return null;

const dismiss = (permanent: boolean) => {
  if (permanent) localStorage.setItem(noticeKey, 'hidden');
  setVisible(false);  // ← 팝업 전체를 꺼버림
};

// 변경 후
const [sessionDismissed, setSessionDismissed] = useState<string[]>([]);

const activeAnnouncement = useMemo(() =>
  candidates.find(a =>
    localStorage.getItem(a.id) !== 'hidden' && !sessionDismissed.includes(a.id)
  ) ?? null
, [stockSplitAnnouncement, sessionDismissed]);

if (!activeAnnouncement) return null;

const dismiss = (permanent: boolean) => {
  if (permanent) localStorage.setItem(noticeKey, 'hidden');
  setSessionDismissed(prev => [...prev, noticeKey]);  // ← 해당 공지만 닫음
};
```

### 2. 액면분할 안내 페이지 표 형식 개선

**수정 파일:**

| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/components/announcements/announcementData.ts` | `AnnouncementSection` 타입에 `table?` 필드 추가, 기존 `rows` optional로 변경 |
| `frontend/src/components/announcements/AnnouncementArchiveView.tsx` | section 내 `table` 존재 여부로 렌더링 분기 추가 |

**타입 확장:**

```ts
export interface AnnouncementSection {
  title: string;
  rows?: { label: string; value: string; tone?: 'accent' | 'danger' }[];
  table?: {
    headers: string[];     // ['종목', '분할 전 가격', '분할 후 가격']
    rows: string[][];      // [['스트리머A', '2,300,000원', '230,000원'], ...]
  };
  note?: string;
}
```

**렌더러 분기 (`AnnouncementArchiveView.tsx`):**

```tsx
{section.table ? (
  <table className="w-full text-xs border-collapse">
    <thead>
      <tr>
        {section.table.headers.map(h => (
          <th key={h} className="text-left py-1 pr-3 font-bold"
              style={{ color: 'var(--accent)', borderBottom: '1px solid var(--border-card)' }}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {section.table.rows.map((row, i) => (
        <tr key={i}>
          {row.map((cell, j) => (
            <td key={j} className="py-1 pr-3 text-white">{cell}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
) : (
  section.rows?.map(row => (...))  // 기존 렌더링 유지
)}
```

**새 분할 공지 데이터 예시:**

```ts
{
  title: '분할 대상 종목',
  table: {
    headers: ['종목', '분할 전 가격', '분할 후 가격'],
    rows: [
      ['스트리머A', '2,300,000원', '230,000원'],
      ['스트리머B', '1,500,000원', '150,000원'],
    ],
  },
  note: '분할 비율은 10:1이며, 보유 수량은 10배로 조정됩니다.',
},
```

### 3. 초기 AMM 풀 크기 100배 확대 (가격 변동폭 축소)

**배경:**

`AmmMigrationService.calcPumpCostTarget()`이 풀 깊이를 결정함. 현재 Tier 1 기준 10% 펌핑 목표 비용이 **240,000원**인데, 신규 유저 초기 잔고(10,000,000원)로 단독 거래 시 Tier 1 종목을 **4,000% 이상** 올릴 수 있는 구조.

**현재 `calcPumpCostTarget` 값 vs 변경 제안 (100배):**

| 티어 | 팔로워 수 | 현재 10% 펌핑 비용 | 변경 후 | 변경 후 최대 단독 등락폭 |
|------|----------|-------------------|---------|------------------------|
| 1 | < 10,000 | 240,000원 | 24,000,000원 | ~4% (1인 전액 기준) |
| 2 | < 100,000 | 2,440,000원 | 244,000,000원 | ~0.4% |
| 3 | < 1,000,000 | 24,400,000원 | 2,440,000,000원 | ~0.04% |
| 4 | ≥ 1,000,000 | 244,000,000원 | 24,400,000,000원 | ~0.004% |

**수정 파일:** `backend/src/main/java/com/spotchzxk/service/AmmMigrationService.java`

```java
// 변경 전
static long calcPumpCostTarget(int followerCount) {
    if (followerCount < 10_000)    return 240_000L;
    if (followerCount < 100_000)   return 2_440_000L;
    if (followerCount < 1_000_000) return 24_400_000L;
    return 244_000_000L;
}

// 변경 후 (100배)
static long calcPumpCostTarget(int followerCount) {
    if (followerCount < 10_000)    return 24_000_000L;
    if (followerCount < 100_000)   return 244_000_000L;
    if (followerCount < 1_000_000) return 2_440_000_000L;
    return 24_400_000_000L;
}
```

**주의사항 — 기존 종목 풀 재적용 필요:**

`AmmMigrationService`는 서버 기동 시 `coinReserve > 0`인 종목을 재마이그레이션하지 않고 건너뜀. 상수만 바꿔도 **신규 상장 종목에만 적용**되고 기존 종목은 그대로임.

기존 종목에 반영하려면 아래 중 하나 선택:

| 방법 | 내용 | 비고 |
|------|------|------|
| **Flyway migration** | `UPDATE stocks SET coin_reserve = 0` → 서버 재기동 시 전체 재마이그레이션 | 가장 간단 |
| **Admin API** | `forceRemigrateAll()` 메서드 추가 후 관리자 엔드포인트 노출 | 제어 용이 |
| **수동 SQL** | 각 종목의 `coin_reserve`, `share_reserve`를 새 공식으로 직접 UPDATE | 운영 중 적용 가능 |
