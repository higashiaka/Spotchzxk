import { useOrderBook, OrderBookEntry } from '../../hooks/useOrderBook';
import { Stock } from '../../hooks/useStocks';
import { fmt, changePct, priceColor } from '../../utils';

interface OrderBookProps {
  streamer: Stock;
  onSelectPrice: (price: number) => void;
}

export const OrderBook = ({ streamer, onSelectPrice }: OrderBookProps) => {
  const { orderBook, loading, error } = useOrderBook(streamer.id);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[#626B7A]">
        호가 정보 불러오는 중...
      </div>
    );
  }

  if (error || !orderBook) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[#FF5252]">
        호가 정보를 가져오지 못했습니다.
      </div>
    );
  }

  const { asks, bids, currentPrice } = orderBook;

  // 비주얼 바의 최대 스케일을 위한 최대 수량 계산
  const maxQty = Math.max(
    1,
    ...asks.map((a) => a.quantity),
    ...bids.map((b) => b.quantity)
  );

  const pct = changePct(currentPrice, streamer.basePrice);

  return (
    <div className="h-full flex flex-col bg-[#0B0E14] text-white select-none">
      {/* 타이틀 및 헤더 */}
      <div className="p-3 border-b border-[#1A2232] flex justify-between items-center shrink-0">
        <span className="text-xs font-bold text-[#8491A5]">실시간 호가</span>
        <span className="text-[10px] text-[#626B7A]">*호가 클릭 시 가격 입력</span>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col">
        {/* 매도 호가 (Asks) - 가격 높은 순서대로 위에 배치 */}
        <div className="flex-1 flex flex-col justify-end min-h-[120px]">
          {[...asks].reverse().map((ask, idx) => {
            const widthPct = Math.min(100, (ask.quantity / maxQty) * 100);
            return (
              <div
                key={`ask-${idx}-${ask.price}`}
                onClick={() => onSelectPrice(ask.price)}
                className="relative flex justify-between items-center py-1.5 px-4 cursor-pointer hover:bg-[#1A2232] transition-colors"
              >
                {/* 수량 바 시각화 (매도: Blue 계열) */}
                <div
                  className="absolute right-0 top-0 bottom-0 bg-[#3D8BFF]/10 pointer-events-none transition-all duration-300"
                  style={{ width: `${widthPct}%` }}
                />
                <span className="font-mono text-sm font-bold text-[#3D8BFF] z-10">
                  {fmt(ask.price)}
                </span>
                <span className="font-mono text-xs font-semibold text-[#BAC4D1] z-10">
                  {ask.quantity.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>

        {/* 현재가 및 스프레드 표시 영역 */}
        <div className="py-2.5 px-4 bg-[#131924] border-y border-[#1A2232] flex justify-between items-center shrink-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-base font-extrabold" style={{ color: priceColor(pct) }}>
              {fmt(currentPrice)}
            </span>
            <span className="text-[10px] font-bold" style={{ color: priceColor(pct) }}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
            </span>
          </div>
          <span className="text-[10px] text-[#626B7A]">기준가 {fmt(streamer.basePrice)}</span>
        </div>

        {/* 매수 호가 (Bids) - 가격 높은 순서대로 위에 배치 */}
        <div className="flex-1 flex flex-col justify-start min-h-[120px]">
          {bids.map((bid, idx) => {
            const widthPct = Math.min(100, (bid.quantity / maxQty) * 100);
            return (
              <div
                key={`bid-${idx}-${bid.price}`}
                onClick={() => onSelectPrice(bid.price)}
                className="relative flex justify-between items-center py-1.5 px-4 cursor-pointer hover:bg-[#1A2232] transition-colors"
              >
                {/* 수량 바 시각화 (매수: Red 계열) */}
                <div
                  className="absolute right-0 top-0 bottom-0 bg-[#FF5252]/10 pointer-events-none transition-all duration-300"
                  style={{ width: `${widthPct}%` }}
                />
                <span className="font-mono text-sm font-bold text-[#FF5252] z-10">
                  {fmt(bid.price)}
                </span>
                <span className="font-mono text-xs font-semibold text-[#BAC4D1] z-10">
                  {bid.quantity.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
