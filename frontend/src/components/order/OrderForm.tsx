// 주문 폼: 현재가, 보유 수량, 잔고를 기준으로 매수/매도 가능 여부를 계산합니다.
import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { useStockPrice } from '../../hooks/useStockPrice';
import { useTrade } from '../../hooks/useTrade';
import { usePortfolio } from '../../hooks/usePortfolio';
import { fmt, changePct, priceColor } from '../../utils';

export const OrderForm = ({
  streamer,
  user,
  qtyStr,
  setQtyStr,
  orderType,
  setOrderType,
}: {
  streamer: Stock;
  user: User | null;
  qtyStr: string;
  setQtyStr: (v: string) => void;
  orderType: 'buy' | 'sell';
  setOrderType: (v: 'buy' | 'sell') => void;
}) => {
  const { currentPrice } = useStockPrice(streamer.id, streamer.price);
  const tradeMutation = useTrade(user?.uid || 'spectator');
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(user?.uid);

  const qty = Math.max(0, parseInt(qtyStr, 10) || 0);
  const balance: number = Number(portfolio?.balance ?? 0);
  const held: number = Number(portfolio?.shares?.[streamer.id] ?? 0);

  const totalCost = currentPrice * qty;
  const postBalance = orderType === 'buy' ? balance - totalCost : balance + totalCost;
  const pct = changePct(currentPrice, streamer.basePrice);

  const maxBuy = currentPrice > 0 ? Math.floor(balance / currentPrice) : 0;
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
      <div className="h-full flex items-center justify-center text-sm text-[#626B7A]">
        포트폴리오 불러오는 중...
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
    });
  };

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar bg-[#0B0E14] text-white">
      {/* 매수/매도 탭 */}
      <div className="rounded-xl p-1 flex mb-4 bg-[#131924]">
        <button type="button" onClick={() => setOrderType('buy')}
          className="flex-1 py-2 rounded-lg text-xs font-extrabold transition-all"
          style={{ backgroundColor: orderType === 'buy' ? '#FF5252' : 'transparent', color: orderType === 'buy' ? '#fff' : '#626B7A' }}>
          매수
        </button>
        <button type="button" onClick={() => setOrderType('sell')}
          className="flex-1 py-2 rounded-lg text-xs font-extrabold transition-all"
          style={{ backgroundColor: orderType === 'sell' ? '#3D8BFF' : 'transparent', color: orderType === 'sell' ? '#fff' : '#626B7A' }}>
          매도
        </button>
      </div>

      {/* 선택 종목 */}
      <div className="mb-4">
        <p className="text-[10px] font-bold mb-1 text-[#8491A5]">선택 종목</p>
        <div className="rounded-xl border px-3 py-2 bg-[#131924] border-[#222A3A]">
          <p className="text-white font-bold text-sm">
            {streamer.name}
            <span className="font-mono ml-2" style={{ color: priceColor(pct) }}>
              ({fmt(currentPrice)})
            </span>
          </p>
        </div>
      </div>

      {/* 현재가 */}
      <div className="mb-4">
        <p className="text-[10px] font-bold mb-1 text-[#8491A5]">현재가 (체결 기준)</p>
        <div className="rounded-xl border px-3 py-2.5 flex justify-between items-center bg-[#131924] border-[#222A3A]">
          <p className="font-mono font-bold text-base" style={{ color: priceColor(pct) }}>
            {fmt(currentPrice)}
          </p>
          <span className="text-[10px] text-[#626B7A]">시장가</span>
        </div>
      </div>

      {/* 주문 수량 */}
      <div className="mb-3">
        <p className="text-[10px] font-bold mb-1 text-[#8491A5]">주문 수량 (주)</p>
        <input
          type="number"
          value={qtyStr}
          onChange={(e) => setQtyStr(e.target.value)}
          min="1"
          disabled={!user}
          placeholder={!user ? '로그인 필요' : '수량 입력'}
          className="w-full rounded-xl border py-2.5 px-3 text-white font-mono text-base focus:outline-none bg-[#131924] border-[#222A3A] disabled:opacity-50"
        />
      </div>

      {/* 퀵 % 버튼 */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {([0.1, 0.25, 0.5, 1.0] as const).map((r) => (
          <button key={r} type="button" onClick={() => setQuick(r)}
            className="rounded-lg py-1.5 text-[11px] font-bold bg-[#1A2232] text-[#BAC4D1] hover:bg-[#222A3A] transition-colors">
            {r * 100}%
          </button>
        ))}
      </div>

      {/* 주문 요약 */}
      <div className="pt-3 mb-5 border-t border-[#222A3A]">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-[#8491A5]">주문 총액</span>
          <span className="font-mono text-lg font-extrabold"
            style={{ color: orderType === 'buy' ? '#FF5252' : '#3D8BFF' }}>
            {fmt(totalCost)}
          </span>
        </div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-[#8491A5]">주문 후 예상 잔액</span>
          <span className="text-xs font-mono font-bold text-white">{fmt(Math.max(0, postBalance))}</span>
        </div>
        {orderType === 'sell' && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#8491A5]">현재 보유량</span>
            <span className="text-xs font-mono font-bold text-white">{held}주</span>
          </div>
        )}
      </div>

      {orderType === 'buy' && !!user && qty > 0 && balance < totalCost && (
        <p className="text-xs text-center mb-3 text-[#FF5252]">
          잔고가 부족합니다 (보유: {fmt(balance)})
        </p>
      )}

      <button type="button" onClick={handleSubmit}
        disabled={tradeMutation.isPending || !canSubmit}
        className="w-full rounded-xl py-3.5 text-white font-extrabold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.99]"
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
