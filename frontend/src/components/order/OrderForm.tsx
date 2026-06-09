import { User } from 'firebase/auth';
import { useState } from 'react';
import { Stock } from '../../hooks/useStocks';
import { useStockPrice } from '../../hooks/useStockPrice';
import { useTrade } from '../../hooks/useTrade';
import { usePortfolio } from '../../hooks/usePortfolio';
import { avatarColor, fmt, changePct, priceColorClass, tradeColorClass } from '../../utils';
import { OrderBookPanel } from './OrderBookPanel';
import { PendingOrdersPanel } from './PendingOrdersPanel';

const PRICE_IMPACT_PER_SHARE = 0.0005;

const averageImpactPrice = (currentPrice: number, isBuy: boolean, quantity: number): number => {
  if (currentPrice <= 0 || quantity <= 0) return 0;
  const buyRate = 1 + PRICE_IMPACT_PER_SHARE;
  const rate = isBuy ? buyRate : 1 / buyRate;
  const total = isBuy
    ? currentPrice * rate * (Math.pow(rate, quantity) - 1) / (rate - 1)
    : currentPrice * rate * (1 - Math.pow(rate, quantity)) / (1 - rate);
  return Math.max(1, Math.round(total / quantity));
};

const maxAffordableMarketBuyQuantity = (balance: number, currentPrice: number): number => {
  if (balance <= 0 || currentPrice <= 0) return 0;
  let low = 0;
  let high = Math.max(0, Math.floor(balance / currentPrice));
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const cost = averageImpactPrice(currentPrice, true, mid) * mid;
    if (cost <= balance) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
};

/** Buy/sell order form component.
 *  Computes order feasibility from real-time price, held quantity,
 *  and balance, then submits a market order to the server */
export const OrderForm = ({
  streamer, user, qtyStr, setQtyStr, orderType, setOrderType, embedded = false,
}: {
  /** Target stock for the order */
  streamer: Stock;
  /** Authenticated user, null if not logged in */
  user: User | null;
  /** Order quantity as string to preserve intermediate input state */
  qtyStr: string;
  /** Quantity change handler */
  setQtyStr: (v: string) => void;
  /** Order direction (buy or sell) */
  orderType: 'buy' | 'sell';
  /** Order direction change handler */
  setOrderType: (v: 'buy' | 'sell') => void;
  /** Reduces outer chrome when embedded */
  embedded?: boolean;
}) => {
  const { currentPrice } = useStockPrice(streamer.id, streamer.price);
  const tradeMutation = useTrade(user?.uid || 'spectator');
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(user?.uid);
  const [orderMode, setOrderMode] = useState<'market' | 'limit'>('market');
  const [limitPriceStr, setLimitPriceStr] = useState('');

  /** Parsed integer quantity, clamped to minimum 0 */
  const qty = Math.max(0, parseInt(qtyStr, 10) || 0);
  /** Current cash balance */
  const balance: number = Number(portfolio?.balance ?? 0);
  /** Held quantity for this stock */
  const held: number = Number(portfolio?.shares?.[streamer.id] ?? 0);
  const limitPrice = Math.max(0, Math.floor(parseFloat(limitPriceStr) || 0));
  const orderPrice = orderMode === 'limit' && limitPrice > 0 ? limitPrice : currentPrice;
  const marketExecutionPrice = averageImpactPrice(currentPrice, orderType === 'buy', qty);
  const estimatedExecutionPrice = orderMode === 'market' ? marketExecutionPrice : orderPrice;

  /** Total order cost */
  const totalCost = estimatedExecutionPrice * qty;
  /** Estimated balance after the order */
  const postBalance = orderType === 'buy' ? balance - totalCost : balance + totalCost;
  const pct = changePct(currentPrice, streamer.basePrice);

  /** Maximum purchasable quantity given current balance */
  const maxBuy = orderMode === 'market'
    ? maxAffordableMarketBuyQuantity(balance, currentPrice)
    : orderPrice > 0 ? Math.floor(balance / orderPrice) : 0;
  /** Maximum sellable quantity (equals held quantity) */
  const maxSell = held;

  /** Sets quantity from a quick-ratio button click (minimum 1 share) */
  const setQuick = (ratio: number) => {
    const max = orderType === 'buy' ? maxBuy : maxSell;
    setQtyStr(String(Math.max(1, Math.floor(max * ratio))));
  };

  /** Buy feasibility: logged in + qty > 0 + sufficient balance */
  const canBuy = !!user && qty > 0 && balance >= totalCost;
  /** Sell feasibility: logged in + qty > 0 + sufficient holdings */
  const canSell = !!user && qty > 0 && held >= qty;
  /** Whether the order can be submitted for the current direction */
  const hasValidLimit = orderMode === 'market' || limitPrice > 0;
  const canSubmit = hasValidLimit && (orderType === 'buy' ? canBuy : canSell);

  if (portfolioLoading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[var(--text-dim)]">
        포트폴리오 불러오는 중...
      </div>
    );
  }

  /** Order submission handler */
  const handleSubmit = () => {
    if (!canSubmit) return;
    tradeMutation.mutate({
      streamerId: streamer.id,
      type: orderType,
      quantity: qty,
      estimatedPrice: currentPrice,
      estimatedExecutionPrice,
      orderMode,
      limitPrice: orderMode === 'limit' ? limitPrice : undefined,
    });
  };

  return (
    <div className={`${embedded ? 'h-auto p-0' : 'h-full overflow-y-auto p-4 pb-24 surface-sidebar'} hide-scrollbar text-white`}>
      {/* Buy/sell tab toggle */}
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

      <div className="rounded-xl p-1 flex mb-4 surface-card-secondary">
        <button type="button" onClick={() => setOrderMode('market')}
          className={`flex-1 py-2 rounded-lg text-xs font-extrabold transition-all ${orderMode === 'market' ? 'bg-primary text-white' : 'bg-transparent text-dim-token'}`}>
          시장가
        </button>
        <button type="button" onClick={() => setOrderMode('limit')}
          className={`flex-1 py-2 rounded-lg text-xs font-extrabold transition-all ${orderMode === 'limit' ? 'bg-primary text-white' : 'bg-transparent text-dim-token'}`}>
          지정가
        </button>
      </div>

      {/* Selected stock display */}
      <div className="mb-4">
        <p className="text-[10px] font-bold mb-1 text-[var(--text-muted)]">선택 종목</p>
        <div className="rounded-xl border px-3 py-2 flex items-center gap-2 surface-card-secondary border-primary-token">
          <div className="shrink-0"
            style={{ padding: 2, borderRadius: '50%', background: streamer.isLive ? '#22C55E' : 'transparent' }}>
            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-black"
              style={{ backgroundColor: streamer.profileImageUrl ? 'transparent' : avatarColor(streamer.name) }}>
              {streamer.profileImageUrl ? (
                <img src={streamer.profileImageUrl} alt={streamer.name} className="w-full h-full object-cover" />
              ) : (
                streamer.name.slice(0, 2)
              )}
            </div>
          </div>
          <p className="text-white font-bold text-sm min-w-0">
            <span className="truncate inline-block max-w-full align-bottom">{streamer.name}</span>
            <span className={`font-mono ml-2 ${priceColorClass(pct)}`}>
              ({fmt(currentPrice)})
            </span>
          </p>
        </div>
      </div>

      {/* Current price (market order basis) */}
      <div className="mb-4">
        <p className="text-[10px] font-bold mb-1 text-[var(--text-muted)]">현재가 (체결 기준)</p>
        <div className="rounded-xl border px-3 py-2.5 flex justify-between items-center surface-card-secondary border-primary-token">
          <p className={`font-mono font-bold text-base ${priceColorClass(pct)}`}>
            {fmt(currentPrice)}
          </p>
          <span className="text-[10px] text-[var(--text-dim)]">시장가</span>
        </div>
      </div>

      {orderMode === 'limit' && (
        <div className="mb-4">
          <p className="text-[10px] font-bold mb-1 text-[var(--text-muted)]">지정가</p>
          <input
            type="number"
            value={limitPriceStr}
            onChange={(e) => setLimitPriceStr(e.target.value)}
            min="1"
            disabled={!user}
            placeholder="가격 입력"
            className="w-full rounded-xl border py-2.5 px-3 text-white font-mono text-base focus:outline-none disabled:opacity-50 surface-card-secondary border-primary-token"
          />
        </div>
      )}

      {/* Order quantity input */}
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

      {/* Quick ratio buttons (10% / 25% / 50% / 100%) */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {([0.1, 0.25, 0.5, 1.0] as const).map((r) => (
          <button key={r} type="button" onClick={() => setQuick(r)}
            className="rounded-lg py-1.5 text-[11px] font-bold transition-colors surface-card text-secondary-token">
            {r * 100}%
          </button>
        ))}
      </div>

      {/* Order summary (total / estimated balance / holdings) */}
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

      {/* Insufficient balance warning */}
      {orderType === 'buy' && !!user && qty > 0 && balance < totalCost && (
        <p className="text-xs text-center mb-3 text-[#FF5252]">
          잔고가 부족합니다 (보유: {fmt(balance)})
        </p>
      )}

      {/* Order submit button */}
      <button type="button" onClick={handleSubmit}
        disabled={tradeMutation.isPending || !canSubmit}
        className={`w-full rounded-xl py-3.5 text-white font-extrabold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.99] ${orderType === 'buy' ? 'bg-danger' : 'bg-info'}`}>
        {tradeMutation.isPending
          ? '주문 처리 중...'
          : orderType === 'buy' && !!user && qty > 0 && balance < totalCost
          ? '잔고 부족'
          : `${orderType === 'buy' ? '매수' : '매도'} 주문하기`}
      </button>
      {!embedded && (
        <div className="mt-4 space-y-3">
          <OrderBookPanel streamerId={streamer.id} />
          <PendingOrdersPanel userId={user?.uid} streamerId={streamer.id} />
        </div>
      )}
    </div>
  );
};
