import { User } from 'firebase/auth';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { Stock } from '../../hooks/useStocks';
import { useStockPrice } from '../../hooks/useStockPrice';
import { useTrade } from '../../hooks/useTrade';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useHoldings } from '../../hooks/useHoldings';
import { avatarColor, fmt, fmtBigInt, fmtShares, changePct, priceColorClass, tradeColorClass } from '../../utils';
import { LegalFooter } from '../legal/LegalFooter';
import { OrderBookPanel } from './OrderBookPanel';
import { PendingOrdersPanel } from './PendingOrdersPanel';

const FEE_RATE_NUMERATOR = 15n;
const FEE_RATE_DENOMINATOR = 1000n;
const PRICE_SCALE = 1000000n;

const ceilDiv = (num: bigint, den: bigint): bigint => {
  const q = num / den;
  return num % den > 0n ? q + 1n : q;
};

const decimalToScaledBigInt = (value: number | string, scale: bigint = PRICE_SCALE): bigint => {
  const raw = String(value);
  const normalized = raw.includes('e') || raw.includes('E') ? Number(value).toFixed(6) : raw;
  const [integerPart, fractionPart = ''] = normalized.replace(/[^\d.]/g, '').split('.');
  const scaleDigits = scale.toString().length - 1;
  const fraction = (fractionPart + '0'.repeat(scaleDigits)).slice(0, scaleDigits);
  return BigInt(integerPart || '0') * scale + BigInt(fraction || '0');
};

const decimalToIntegerBigInt = (value: number | string): bigint => {
  const raw = String(value);
  const normalized = raw.includes('e') || raw.includes('E') ? Number(value).toFixed(0) : raw;
  const integerPart = normalized.replace(/[^\d.]/g, '').split('.')[0];
  return BigInt(integerPart || '0');
};

const parseQuantity = (value: string): bigint => {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? BigInt(digits) : 0n;
};

const bigintToSafeNumber = (value: bigint): number => {
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
};

const fallbackTradeAmount = (currentPrice: number, isBuy: boolean, quantity: bigint): bigint => {
  if (currentPrice <= 0 || quantity <= 0n) return 0n;
  const gross = ceilDiv(decimalToScaledBigInt(currentPrice) * quantity, PRICE_SCALE);
  const fee = ceilDiv(gross * FEE_RATE_NUMERATOR, FEE_RATE_DENOMINATOR);
  return isBuy ? gross + fee : gross - fee;
};

const ammTradeAmount = (
  currentPrice: number,
  coinReserve: bigint | undefined,
  shareReserve: bigint | undefined,
  isBuy: boolean,
  quantity: bigint,
): bigint => {
  if (quantity <= 0n) return 0n;
  if (!coinReserve || !shareReserve) {
    return fallbackTradeAmount(currentPrice, isBuy, quantity);
  }
  const qty = quantity;
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
  quantity: bigint,
): number => {
  if (quantity <= 0n) return 0;
  const userNetAmount = ammTradeAmount(currentPrice, coinReserve, shareReserve, isBuy, quantity);
  return Number(userNetAmount) / bigintToSafeNumber(quantity);
};

const maxAffordableMarketBuyQuantity = (
  balance: bigint,
  currentPrice: number,
  coinReserve?: bigint,
  shareReserve?: bigint,
): bigint => {
  if (balance <= 0n || currentPrice <= 0) return 0n;
  if (coinReserve && shareReserve && shareReserve > 1n) {
    let low = 0n;
    let high = shareReserve - 1n;
    while (low < high) {
      const mid = (low + high + 1n) / 2n;
      const cost = ammTradeAmount(currentPrice, coinReserve, shareReserve, true, mid);
      if (cost <= balance) {
        low = mid;
      } else {
        high = mid - 1n;
      }
    }
    return low;
  }

  let low = 0n;
  let high = 1n;
  while (fallbackTradeAmount(currentPrice, true, high) <= balance) {
    low = high;
    high *= 2n;
  }
  while (low < high) {
    const mid = (low + high + 1n) / 2n;
    // Guard: float precision loss can make mid === low when both approach MAX_SAFE_INTEGER,
    // causing cost <= balance to leave low unchanged → infinite loop.
    const cost = fallbackTradeAmount(currentPrice, true, mid);
    if (cost <= balance) {
      low = mid;
    } else {
      high = mid - 1n;
    }
  }
  return low;
};

const tradingSuspensionLabel = (reason?: string | null): string => {
  switch (reason) {
    case 'PRICE_BELOW_ONE':
      return '거래 정지 종목: 1원 미만 가격 보호';
    case 'INVALID_AMM_POOL':
      return '거래 정지 종목: AMM 풀 보호';
    case 'API_UNAVAILABLE':
      return '거래 정지 종목: API 응답 없음';
    default:
      return '거래 정지 종목';
  }
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
  const { holdings } = useHoldings(portfolio, [streamer]);
  const [orderMode, setOrderMode] = useState<'market' | 'limit'>('market');
  const [limitPriceStr, setLimitPriceStr] = useState('');
  const [sellAll, setSellAll] = useState(false);

  const qtyBig = parseQuantity(qtyStr);
  const qty = bigintToSafeNumber(qtyBig);
  const balance: number = Number(portfolio?.balance ?? 0);
  const balanceBigInt = decimalToIntegerBigInt(portfolio?.balance ?? '0');
  const heldBig = parseQuantity(String(portfolio?.shares?.[streamer.id] ?? 0).replace(/\..*$/, ''));
  const held = holdings.find(holding => holding.streamer.id === streamer.id)?.qty ?? 0;
  const limitPrice = Math.max(0, parseFloat(limitPriceStr) || 0);
  const orderPrice = orderMode === 'limit' && limitPrice > 0 ? limitPrice : currentPrice;
  const marketExecutionPrice = averageAmmPrice(
    currentPrice,
    undefined,
    undefined,
    orderType === 'buy',
    qtyBig,
  );
  const marketExecutionAmount = ammTradeAmount(
    currentPrice,
    undefined,
    undefined,
    orderType === 'buy',
    qtyBig,
  );
  const estimatedExecutionPrice = orderMode === 'market' ? marketExecutionPrice : orderPrice;
  const limitGrossAmount = ceilDiv(decimalToScaledBigInt(estimatedExecutionPrice) * qtyBig, PRICE_SCALE);
  const limitFee = ceilDiv(limitGrossAmount * FEE_RATE_NUMERATOR, FEE_RATE_DENOMINATOR);

  const totalCost: bigint = orderMode === 'market'
    ? marketExecutionAmount
    : orderType === 'buy' ? limitGrossAmount + limitFee : limitGrossAmount > limitFee ? limitGrossAmount - limitFee : 0n;
  const postBalance: bigint = orderType === 'buy' ? balanceBigInt - totalCost : balanceBigInt + totalCost;
  const pct = changePct(currentPrice, streamer.basePrice);

  const maxBuy = orderMode === 'market'
    ? maxAffordableMarketBuyQuantity(balanceBigInt, currentPrice)
    : orderPrice > 0 ? balanceBigInt / (ceilDiv(decimalToScaledBigInt(orderPrice) * (FEE_RATE_DENOMINATOR + FEE_RATE_NUMERATOR), PRICE_SCALE * FEE_RATE_DENOMINATOR) || 1n) : 0n;
  const maxSell = heldBig;

  const setQuick = (ratio: number) => {
    setSellAll(orderType === 'sell' && orderMode === 'market' && ratio === 1);
    const max = orderType === 'buy' ? maxBuy : maxSell;
    if (typeof max === 'bigint') {
      const scaled = (max * BigInt(Math.round(ratio * 100))) / 100n;
      setQtyStr((scaled > 0n ? scaled : 1n).toString());
      return;
    }
    setQtyStr(String(Math.max(1, Math.floor(max * ratio))));
  };

  const isSuspended = streamer.tradingSuspended ?? false;
  const suspensionLabel = tradingSuspensionLabel(streamer.tradingSuspensionReason);
  const canBuy = !!user && qtyBig > 0n && balanceBigInt >= totalCost && !isSuspended;
  const canSell = !!user
    && (sellAll ? held > 0 && orderMode === 'market' : qtyBig > 0n && heldBig >= qtyBig)
    && !isSuspended;
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
      quantity: qtyBig.toString(),
      estimatedPrice: currentPrice,
      estimatedExecutionPrice,
      estimatedTotalAmount: totalCost.toString(),
      orderMode,
      sellAll: orderType === 'sell' && orderMode === 'market' && sellAll,
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
            min="0.000001"
            step="0.000001"
            disabled={!user}
            placeholder="가격 입력"
            className="w-full rounded-xl border py-2.5 px-3 text-white font-mono text-base focus:outline-none disabled:opacity-50 surface-card-secondary border-primary-token"
          />
        </div>
      )}

      <div className="mb-3">
        <p className="text-[10px] font-bold mb-1 text-[var(--text-muted)]">주문 수량 (주)</p>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={qtyStr}
          onChange={(e) => {
            setSellAll(false);
            setQtyStr(e.target.value);
          }}
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
          {suspensionLabel}
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
          : orderType === 'buy' && !!user && qty > 0 && balanceBigInt < totalCost
          ? '잔고 부족'
          : `${orderType === 'buy' ? '매수' : '매도'} 주문하기`}
      </button>
      {!embedded && (
        <div className="mt-4 space-y-3">
          <OrderBookPanel streamerId={streamer.id} />
          <PendingOrdersPanel userId={user?.uid} streamerId={streamer.id} />
        </div>
      )}
      {!embedded && <LegalFooter />}
    </form>
  );
};
