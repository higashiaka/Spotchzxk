import { useState } from 'react';
import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { useStockPrice } from '../../hooks/useStockPrice';
import { useTrade } from '../../hooks/useTrade';
import { usePortfolio } from '../../hooks/usePortfolio';
import { fmt, changePct, priceColor } from '../../utils';

export const OrderForm = ({
  streamer, user,
}: {
  streamer: Stock;
  user: User | null;
}) => {
  const { currentPrice } = useStockPrice(streamer.id, streamer.price);
  const tradeMutation = useTrade(user?.uid || 'spectator');
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(user?.uid);
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [qtyStr, setQtyStr] = useState('1');

  const qty = Math.max(0, parseInt(qtyStr, 10) || 0);
  const balance: number = Number(portfolio?.balance ?? 0);
  const held: number = Number(portfolio?.shares?.[streamer.id] ?? 0);

  const PRICE_IMPACT_FACTOR = 0.0005;
  const calcCost = (n: number, buy: boolean) => {
    if (n <= 0) return 0;
    const u = buy ? 1 + PRICE_IMPACT_FACTOR : 1 - PRICE_IMPACT_FACTOR;
    const fm = Math.pow(u, n);
    const sumMult = buy ? u * (fm - 1) / PRICE_IMPACT_FACTOR : u * (1 - fm) / PRICE_IMPACT_FACTOR;
    return Math.max(0, currentPrice * sumMult);
  };
  const totalCost = calcCost(qty, orderType === 'buy');
  const avgPrice = qty > 0 ? totalCost / qty : currentPrice;
  const postBalance = orderType === 'buy' ? balance - totalCost : balance + totalCost;
  const pct = changePct(currentPrice, streamer.basePrice);

  const getMaxBuy = () => {
    let low = 0, high = Math.floor(balance / currentPrice) + 1, ans = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (calcCost(mid, true) <= balance) { ans = mid; low = mid + 1; }
      else high = mid - 1;
    }
    return ans;
  };

  const maxBuy = balance > 0 ? getMaxBuy() : 0;
  const maxSell = held;

  const setQuick = (ratio: number) => {
    const max = orderType === 'buy' ? maxBuy : maxSell;
    setQtyStr(String(Math.max(1, Math.floor(max * ratio))));
  };

  const canBuy = !!user && qty > 0 && balance >= totalCost;
  const canSell = !!user && qty > 0 && held >= qty;
  const canSubmit = orderType === 'buy' ? canBuy : canSell;

  if (portfolioLoading) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: '#626B7A' }}>
        포트폴리오 불러오는 중...
      </div>
    );
  }

  const handleSubmit = () => {
    if (!canSubmit) return;
    tradeMutation.mutate({ streamerId: streamer.id, type: orderType, quantity: qty, estimatedPrice: currentPrice });
  };

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar">
      {/* 매수/매도 토글 */}
      <div className="rounded-xl p-1 flex mb-5" style={{ background: '#131924' }}>
        <button type="button" onClick={() => setOrderType('buy')}
          className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors"
          style={{ backgroundColor: orderType === 'buy' ? '#FF5252' : 'transparent', color: orderType === 'buy' ? '#fff' : '#626B7A' }}>
          매수
        </button>
        <button type="button" onClick={() => setOrderType('sell')}
          className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors"
          style={{ backgroundColor: orderType === 'sell' ? '#3D8BFF' : 'transparent', color: orderType === 'sell' ? '#fff' : '#626B7A' }}>
          매도
        </button>
      </div>

      {/* 선택 종목 */}
      <div className="mb-4">
        <p className="text-xs mb-1" style={{ color: '#8491A5' }}>선택 종목</p>
        <div className="rounded-xl border px-4 py-3" style={{ background: '#131924', borderColor: '#222A3A' }}>
          <p className="text-white font-bold text-sm">{streamer.name}
            <span className="font-mono ml-2" style={{ color: priceColor(pct) }}>({fmt(currentPrice)})</span>
          </p>
        </div>
      </div>

      {/* 예상 체결 단가 */}
      <div className="mb-4">
        <p className="text-xs mb-1" style={{ color: '#8491A5' }}>예상 체결 단가 (슬리피지 포함)</p>
        <div className="rounded-xl border px-4 py-3 flex justify-between items-center" style={{ background: '#131924', borderColor: '#222A3A' }}>
          <p className="font-mono font-bold text-lg" style={{ color: priceColor(pct) }}>{fmt(avgPrice)}</p>
          <span className="text-xs" style={{ color: '#626B7A' }}>{qty > 0 ? '예상 단가' : '현재가'}</span>
        </div>
      </div>

      {/* 주문 수량 */}
      <div className="mb-3">
        <p className="text-xs mb-1" style={{ color: '#8491A5' }}>주문 수량 (주)</p>
        <input
          type="number"
          value={qtyStr}
          onChange={e => setQtyStr(e.target.value)}
          min="1"
          disabled={!user}
          placeholder={!user ? '로그인 필요' : '수량 입력'}
          className="w-full rounded-xl border py-3 px-4 text-white font-mono text-lg focus:outline-none disabled:opacity-50"
          style={{ background: '#131924', borderColor: '#222A3A' }}
        />
      </div>

      {/* 퀵 % 버튼 */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {([0.1, 0.25, 0.5, 1.0] as const).map(r => (
          <button key={r} type="button" onClick={() => setQuick(r)}
            className="rounded-lg py-2 text-xs font-bold transition-colors"
            style={{ background: '#1A2232', color: '#BAC4D1' }}>
            {r * 100}%
          </button>
        ))}
      </div>

      {/* 주문 요약 */}
      <div className="pt-4 mb-5" style={{ borderTop: '1px solid #222A3A' }}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm" style={{ color: '#8491A5' }}>주문 총액</span>
          <span className="font-mono text-xl font-bold" style={{ color: orderType === 'buy' ? '#FF5252' : '#3D8BFF' }}>
            {fmt(totalCost)}
          </span>
        </div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs" style={{ color: '#8491A5' }}>주문 후 잔액</span>
          <span className="text-xs font-mono font-bold text-white">{fmt(Math.max(0, postBalance))}</span>
        </div>
        {orderType === 'sell' && (
          <div className="flex justify-between items-center">
            <span className="text-xs" style={{ color: '#8491A5' }}>현재 보유량</span>
            <span className="text-xs font-mono font-bold text-white">{held}주</span>
          </div>
        )}
      </div>

      {orderType === 'buy' && !!user && qty > 0 && balance < totalCost && (
        <p className="text-xs text-center mb-3" style={{ color: '#FF5252' }}>
          잔고가 부족합니다 (필요: {fmt(totalCost)}, 보유: {fmt(balance)})
        </p>
      )}

      <button type="button" onClick={handleSubmit}
        disabled={tradeMutation.isPending || !canSubmit}
        className="w-full rounded-xl py-4 text-white font-bold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: orderType === 'buy' ? '#FF5252' : '#3D8BFF' }}>
        {tradeMutation.isPending
          ? '주문 처리 중...'
          : orderType === 'buy' && !!user && qty > 0 && balance < totalCost
            ? '잔고 부족'
            : `${orderType === 'buy' ? '매수' : '매도'} 주문하기`}
      </button>
    </div>
  );
};
