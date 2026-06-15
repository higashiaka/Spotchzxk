import { User } from 'firebase/auth';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { Stock } from '../../hooks/useStocks';
import { useStockPrice } from '../../hooks/useStockPrice';
import { useTrade } from '../../hooks/useTrade';
import { usePortfolio } from '../../hooks/usePortfolio';
import { avatarColor, fmt, fmtBigInt, fmtShares, changePct, priceColorClass, tradeColorClass } from '../../utils';
import { OrderBookPanel } from './OrderBookPanel';
import { PendingOrdersPanel } from './PendingOrdersPanel';

const FEE_RATE_NUMERATOR = 15n;
const FEE_RATE_DENOMINATOR = 1000n;

const parseReserve = (value?: string): bigint | undefined => {
  if (!value) return undefined;
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const ceilDiv = (num: bigint, den: bigint): bigint => {
  const q = num / den;
  return num % den > 0n ? q + 1n : q;
};

const fallbackTradeAmount = (currentPrice: number, isBuy: boolean, quantity: number): bigint => {
  if (currentPrice <= 0 || quantity <= 0) return 0n;
  const gross = BigInt(Math.round(currentPrice)) * BigInt(quantity);
  const fee = ceilDiv(gross * FEE_RATE_NUMERATOR, FEE_RATE_DENOMINATOR);
  return isBuy ? gross + fee : gross - fee;
};

const ammTradeAmount = (
  currentPrice: number,
  coinReserve: bigint | undefined,
  shareReserve: bigint | undefined,
  isBuy: boolean,
  quantity: number,
): bigint => {
  if (quantity <= 0) return 0n;
  if (!coinReserve || !shareReserve) {
    return fallbackTradeAmount(currentPrice, isBuy, quantity);
  }
  const qty = BigInt(quantity);
  if (isBuy && qty >= shareReserve) return BigInt(Number.MAX_SAFE_INTEGER) * 1000n;

  const ammAmount = isBuy
    ? ceilDiv(coinReserve * qty, shareReserve - qty)
    : (coinReserve * qty) / (shareReserve + qty);
  const fee = ceilDiv(ammAmount * FEE_RATE_NUMERATOR, FEE_RATE_DENOMINATOR);
  return isBuy ? ammAmount + fee : ammAmount - fee;
};

const averageAmmPrice = (
  currentPrice: number,
  coinReserve: bigint | undefined,
  shareReserve: bigint | undefined,
  isBuy: boolean,
  quantity: number,
): number => {
  if (quantity <= 0) return 0;
  const userNetAmount = ammTradeAmount(currentPrice, coinReserve, shareReserve, isBuy, quantity);
  return Math.max(1, Number(userNetAmount / BigInt(quantity)));
};

const maxAffordableMarketBuyQuantity = (
  balance: number,
  currentPrice: number,
  coinReserve?: bigint,
  shareReserve?: bigint,
): number => {
  if (balance <= 0 || currentPrice <= 0) return 0;
  // Cap high at Number.MAX_SAFE_INTEGER to prevent infinite loop from IEEE 754 precision loss
  // (mid - 1 === mid when mid > MAX_SAFE_INTEGER, causing binary search to never converge)
  let high = Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(0, Math.floor(balance / currentPrice)),
  );
  if (shareReserve && shareReserve > 0n) {
    const poolMax = shareReserve - 1n;
    const poolMaxSafe = poolMax > BigInt(Number.MAX_SAFE_INTEGER)
      ? Number.MAX_SAFE_INTEGER
      : Number(poolMax);
    if (poolMaxSafe < high) high = poolMaxSafe;
  }
  const balanceBigInt = BigInt(Math.floor(balance));
  let low = 0;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    // Guard: float precision loss can make mid === low when both approach MAX_SAFE_INTEGER,
    // causing cost <= balance to leave low unchanged → infinite loop.
    if (mid <= low) break;
    const cost = ammTradeAmount(currentPrice, coinReserve, shareReserve, true, mid);
    if (cost <= balanceBigInt) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
};

export const OrderForm = ({
  streamer, user, qtyStr, setQtyStr, orderType, setOrderType, embedded = false,
}: {
  streamer: Stock;
  user: User | null;
  qtyStr: string;
  setQtyStr: (v: string) => void;
  orderType: 'buy' | 'sell';
  setOrderType: (v: 'buy' | 'sell') => void;
  embedded?: boolean;
}) => {
  const { currentPrice } = useStockPrice(streamer.id, streamer.price);
  const tradeMutation = useTrade(user?.uid || 'spectator');
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(user?.uid);
  const [orderMode, setOrderMode] = useState<'market' | 'limit'>('market');
  const [limitPriceStr, setLimitPriceStr] = useState('');

  const qty = Math.max(0, parseInt(qtyStr, 10) || 0);
  const balance: number = Number(portfolio?.balance ?? 0);
  const held: number = Number(portfolio?.shares?.[streamer.id] ?? 0);
  const limitPrice = Math.max(0, Math.floor(parseFloat(limitPriceStr) || 0));
  const orderPrice = orderMode === 'limit' && limitPrice > 0 ? limitPrice : currentPrice;
  const coinReserve = parseReserve(streamer.coinReserve);
  const shareReserve = parseReserve(streamer.shareReserve);
  const marketExecutionPrice = averageAmmPrice(
    currentPrice,
    coinReserve,
    shareReserve,
    orderType === 'buy',
    qty,
  );
  const marketExecutionAmount = ammTradeAmount(
    currentPrice,
    coinReserve,
    shareReserve,
    orderType === 'buy',
    qty,
  );
  const estimatedExecutionPrice = orderMode === 'market' ? marketExecutionPrice : orderPrice;
  const limitGrossAmount = BigInt(estimatedExecutionPrice) * BigInt(qty);
  const limitFee = ceilDiv(limitGrossAmount * FEE_RATE_NUMERATOR, FEE_RATE_DENOMINATOR);

  const totalCost: bigint = orderMode === 'market'
    ? marketExecutionAmount
    : orderType === 'buy' ? limitGrossAmount + limitFee : limitGrossAmount > limitFee ? limitGrossAmount - limitFee : 0n;
  const balanceBigInt = BigInt(Math.floor(balance));
  const postBalance: bigint = orderType === 'buy' ? balanceBigInt - totalCost : balanceBigInt + totalCost;
  const pct = changePct(currentPrice, streamer.basePrice);

  const maxBuy = orderMode === 'market'
    ? maxAffordableMarketBuyQuantity(balance, currentPrice, coinReserve, shareReserve)
    : orderPrice > 0 ? Math.floor(balance / orderPrice) : 0;
  const maxSell = held;

  const setQuick = (ratio: number) => {
    const max = orderType === 'buy' ? maxBuy : maxSell;
    setQtyStr(String(Math.max(1, Math.floor(max * ratio))));
  };

  const isSuspended = streamer.tradingSuspended ?? false;
  const canBuy = !!user && qty > 0 && balanceBigInt >= totalCost && !isSuspended;
  const canSell = !!user && qty > 0 && held >= qty && !isSuspended;
  const hasValidLimit = orderMode === 'market' || limitPrice > 0;
  const canSubmit = hasValidLimit && (orderType === 'buy' ? canBuy : canSell);

  if (portfolioLoading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[var(--text-dim)]">
        포트폴리오를 불러오는 중...
      </div>
    );
  }

  const handleSubmit = () => {
    if (!canSubmit) return;
    tradeMutation.mutate({
      streamerId: streamer.id,
      type: orderType,
      quantity: qty,
      estimatedPrice: currentPrice,
      estimatedExecutionPrice,
      estimatedTotalAmount: Number(totalCost),
      orderMode,
      limitPrice: orderMode === 'limit' ? limitPrice : undefined,
    });
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleSubmit();
  };

  return (
    <form
      onSubmit={handleFormSubmit}
      className={`${embedded ? 'h-auto p-0' : 'h-full overflow-y-auto p-4 pb-24 surface-sidebar'} hide-scrollbar text-white`}
    >
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
            <span className={`font-mono ml-2 shrink-0 whitespace-nowrap ${priceColorClass(pct)}`}>
              ({fmt(currentPrice)})
            </span>
          </p>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-[10px] font-bold mb-1 text-[var(--text-muted)]">현재가 (체결 기준)</p>
        <div className="rounded-xl border px-3 py-2.5 flex justify-between items-center surface-card-secondary border-primary-token">
          <p className={`font-mono font-bold text-base whitespace-nowrap ${priceColorClass(pct)}`}>
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

      <div className="grid grid-cols-4 gap-2 mb-4">
        {([0.1, 0.25, 0.5, 1.0] as const).map((r) => (
          <button key={r} type="button" onClick={() => setQuick(r)}
            className="rounded-lg py-1.5 text-[11px] font-bold transition-colors surface-card text-secondary-token">
            {r * 100}%
          </button>
        ))}
      </div>

      {isSuspended && (
        <div className="mb-4 rounded-xl px-3 py-2.5 text-xs font-bold text-center bg-[#FF525220] text-[#FF5252] border border-[#FF525240]">
          거래 정지 종목 — API 응답 없음
        </div>
      )}

      <div className="pt-3 mb-5 border-t border-primary-token">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-[var(--text-muted)]">주문 총액</span>
          <span className={`font-mono text-lg font-extrabold ${tradeColorClass(orderType)}`}>
            {fmtBigInt(totalCost)}
          </span>
        </div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-[var(--text-muted)]">주문 후 예상 잔액</span>
          <span className="text-xs font-mono font-bold text-white">{fmtBigInt(postBalance > 0n ? postBalance : 0n)}</span>
        </div>
        {orderType === 'sell' && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-muted)]">현재 보유량</span>
            <span className="text-xs font-mono font-bold text-white">{fmtShares(held)}</span>
          </div>
        )}
      </div>

      {orderType === 'buy' && !!user && qty > 0 && balanceBigInt < totalCost && (
        <p className="text-xs text-center mb-3 text-[#FF5252]">
          잔고가 부족합니다 (보유: {fmt(balance)})
        </p>
      )}

      <button type="submit"
        disabled={tradeMutation.isPending || !canSubmit}
        className={`w-full rounded-xl py-3.5 text-white font-extrabold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.99] ${orderType === 'buy' ? 'bg-danger' : 'bg-info'}`}>
        {tradeMutation.isPending
          ? '주문 처리 중...'
          : isSuspended
          ? '거래 정지'
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
    </form>
  );
};
