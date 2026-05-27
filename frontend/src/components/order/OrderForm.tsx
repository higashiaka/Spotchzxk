import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { useStockPrice } from '../../hooks/useStockPrice';
import { useTrade } from '../../hooks/useTrade';
import { usePortfolio } from '../../hooks/usePortfolio';
import { fmt, changePct, priceColorClass, tradeColorClass } from '../../utils';

/** 매수/매도 주문 폼 컴포넌트.
 *  실시간 현재가, 보유 수량, 잔고를 기반으로 주문 가능 여부를 계산하고
 *  시장가 주문을 서버에 제출
 *
 *  Buy/sell order form component.
 *  Computes order feasibility from real-time price, held quantity,
 *  and balance, then submits a market order to the server */
export const OrderForm = ({
  streamer, user, qtyStr, setQtyStr, orderType, setOrderType,
}: {
  /** 주문 대상 종목 / Target stock for the order */
  streamer: Stock;
  /** 로그인 사용자 (미로그인 시 null) / Authenticated user, null if not logged in */
  user: User | null;
  /** 주문 수량 문자열 (number input의 중간 입력 상태 보존용)
   *  Order quantity as string to preserve intermediate input state */
  qtyStr: string;
  /** 수량 변경 핸들러 / Quantity change handler */
  setQtyStr: (v: string) => void;
  /** 주문 방향 (매수/매도) / Order direction (buy or sell) */
  orderType: 'buy' | 'sell';
  /** 주문 방향 변경 핸들러 / Order direction change handler */
  setOrderType: (v: 'buy' | 'sell') => void;
}) => {
  const { currentPrice } = useStockPrice(streamer.id, streamer.price);
  const tradeMutation = useTrade(user?.uid || 'spectator');
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(user?.uid);

  /** 정수로 파싱된 주문 수량 (0 미만 방지) / Parsed integer quantity, clamped to minimum 0 */
  const qty = Math.max(0, parseInt(qtyStr, 10) || 0);
  /** 현재 현금 잔고 / Current cash balance */
  const balance: number = Number(portfolio?.balance ?? 0);
  /** 해당 종목 보유 수량 / Held quantity for this stock */
  const held: number = Number(portfolio?.shares?.[streamer.id] ?? 0);

  /** 주문 총액 (현재가 × 수량) / Total order cost (current price × quantity) */
  const totalCost = currentPrice * qty;
  /** 주문 후 예상 잔고 / Estimated balance after the order */
  const postBalance = orderType === 'buy' ? balance - totalCost : balance + totalCost;
  const pct = changePct(currentPrice, streamer.basePrice);

  /** 잔고로 살 수 있는 최대 수량 / Maximum purchasable quantity given current balance */
  const maxBuy = currentPrice > 0 ? Math.floor(balance / currentPrice) : 0;
  /** 매도 가능한 최대 수량 (보유 수량) / Maximum sellable quantity (equals held quantity) */
  const maxSell = held;

  /** 퀵 비율 버튼 클릭 시 수량 설정 (최소 1주)
   *  Sets quantity from a quick-ratio button click (minimum 1 share) */
  const setQuick = (ratio: number) => {
    const max = orderType === 'buy' ? maxBuy : maxSell;
    setQtyStr(String(Math.max(1, Math.floor(max * ratio))));
  };

  /** 매수 가능 여부: 로그인 + 수량 > 0 + 잔고 충분 / Buy feasibility: logged in + qty > 0 + sufficient balance */
  const canBuy = !!user && qty > 0 && balance >= totalCost;
  /** 매도 가능 여부: 로그인 + 수량 > 0 + 보유 수량 충분 / Sell feasibility: logged in + qty > 0 + sufficient holdings */
  const canSell = !!user && qty > 0 && held >= qty;
  /** 현재 방향 기준 주문 제출 가능 여부 / Whether the order can be submitted for the current direction */
  const canSubmit = orderType === 'buy' ? canBuy : canSell;

  if (portfolioLoading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[var(--text-dim)]">
        포트폴리오 불러오는 중...
      </div>
    );
  }

  /** 주문 제출 핸들러 / Order submission handler */
  const handleSubmit = () => {
    if (!canSubmit) return;
    tradeMutation.mutate({
      streamerId: streamer.id,
      type: orderType,
      quantity: qty,
      estimatedPrice: currentPrice,
    });
  };

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar text-white surface-sidebar">
      {/* 매수/매도 탭 전환 / Buy/sell tab toggle */}
      <div className="rounded-xl p-1 flex mb-4 surface-card-secondary">
        <button type="button" onClick={() => setOrderType('buy')}
          className={`flex-1 py-2 rounded-lg text-xs font-extrabold transition-all ${orderType === 'buy' ? 'bg-danger text-white' : 'bg-transparent text-dim-token'}`}>
          매수
        </button>
        <button type="button" onClick={() => setOrderType('sell')}
          className={`flex-1 py-2 rounded-lg text-xs font-extrabold transition-all ${orderType === 'sell' ? 'bg-info text-white' : 'bg-transparent text-dim-token'}`}>
          매도
        </button>
      </div>

      {/* 선택 종목 표시 / Selected stock display */}
      <div className="mb-4">
        <p className="text-[10px] font-bold mb-1 text-[var(--text-muted)]">선택 종목</p>
        <div className="rounded-xl border px-3 py-2 surface-card-secondary border-primary-token">
          <p className="text-white font-bold text-sm">
            {streamer.name}
            <span className={`font-mono ml-2 ${priceColorClass(pct)}`}>
              ({fmt(currentPrice)})
            </span>
          </p>
        </div>
      </div>

      {/* 현재가 (시장가 기준) / Current price (market order basis) */}
      <div className="mb-4">
        <p className="text-[10px] font-bold mb-1 text-[var(--text-muted)]">현재가 (체결 기준)</p>
        <div className="rounded-xl border px-3 py-2.5 flex justify-between items-center surface-card-secondary border-primary-token">
          <p className={`font-mono font-bold text-base ${priceColorClass(pct)}`}>
            {fmt(currentPrice)}
          </p>
          <span className="text-[10px] text-[var(--text-dim)]">시장가</span>
        </div>
      </div>

      {/* 주문 수량 입력 / Order quantity input */}
      <div className="mb-3">
        <p className="text-[10px] font-bold mb-1 text-[var(--text-muted)]">주문 수량 (주)</p>
        <input
          type="number"
          value={qtyStr}
          onChange={(e) => setQtyStr(e.target.value)}
          min="1"
          disabled={!user}
          placeholder={!user ? '로그인 필요' : '수량 입력'}
          className="w-full rounded-xl border py-2.5 px-3 text-white font-mono text-base focus:outline-none disabled:opacity-50 surface-card-secondary border-primary-token"
        />
      </div>

      {/* 퀵 비율 버튼 (10% / 25% / 50% / 100%) / Quick ratio buttons */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {([0.1, 0.25, 0.5, 1.0] as const).map((r) => (
          <button key={r} type="button" onClick={() => setQuick(r)}
            className="rounded-lg py-1.5 text-[11px] font-bold transition-colors surface-card text-secondary-token">
            {r * 100}%
          </button>
        ))}
      </div>

      {/* 주문 요약 (총액 / 예상 잔액 / 보유량) / Order summary (total / estimated balance / holdings) */}
      <div className="pt-3 mb-5 border-t border-primary-token">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-[var(--text-muted)]">주문 총액</span>
          <span className={`font-mono text-lg font-extrabold ${tradeColorClass(orderType)}`}>
            {fmt(totalCost)}
          </span>
        </div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-[var(--text-muted)]">주문 후 예상 잔액</span>
          <span className="text-xs font-mono font-bold text-white">{fmt(Math.max(0, postBalance))}</span>
        </div>
        {orderType === 'sell' && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-muted)]">현재 보유량</span>
            <span className="text-xs font-mono font-bold text-white">{held}주</span>
          </div>
        )}
      </div>

      {/* 잔고 부족 경고 / Insufficient balance warning */}
      {orderType === 'buy' && !!user && qty > 0 && balance < totalCost && (
        <p className="text-xs text-center mb-3 text-[#FF5252]">
          잔고가 부족합니다 (보유: {fmt(balance)})
        </p>
      )}

      {/* 주문 제출 버튼 / Order submit button */}
      <button type="button" onClick={handleSubmit}
        disabled={tradeMutation.isPending || !canSubmit}
        className={`w-full rounded-xl py-3.5 text-white font-extrabold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.99] ${orderType === 'buy' ? 'bg-danger' : 'bg-info'}`}>
        {tradeMutation.isPending
          ? '주문 처리 중...'
          : orderType === 'buy' && !!user && qty > 0 && balance < totalCost
          ? '잔고 부족'
          : `${orderType === 'buy' ? '매수' : '매도'} 주문하기`}
      </button>
    </div>
  );
};
