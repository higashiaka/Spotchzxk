import { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { changePct, priceColor, fmt, fmtCompact } from '../../utils';
import { OrderForm } from './OrderForm';
import { OrderBook } from './OrderBook';

export const OrderView = ({
  streamers, selectedStreamer, user, onSelectStreamer,
}: {
  streamers: Stock[];
  selectedStreamer: Stock | null;
  user: User | null;
  onSelectStreamer: (s: Stock) => void;
}) => {
  const [limitPrice, setLimitPrice] = useState<number | null>(null);
  const [prevId, setPrevId] = useState<string | null>(null);

  // 선택 종목이 바뀌었을 때 지정가 초기화
  if (selectedStreamer && selectedStreamer.id !== prevId) {
    setPrevId(selectedStreamer.id);
    setLimitPrice(null);
  }

  if (selectedStreamer) {
    return (
      <div className="h-full flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-[#222A3A] overflow-hidden bg-[#0B0E14]">
        {/* 좌측: 실시간 호가창 */}
        <div className="flex-1 overflow-hidden h-[45%] md:h-full">
          <OrderBook streamer={selectedStreamer} onSelectPrice={setLimitPrice} />
        </div>
        {/* 우측: 주문 폼 */}
        <div className="w-full md:w-[340px] overflow-hidden h-[55%] md:h-full shrink-0">
          <OrderForm 
            streamer={selectedStreamer} 
            user={user} 
            limitPrice={limitPrice} 
            setLimitPrice={setLimitPrice} 
          />
        </div>
      </div>
    );
  }

  // 종목 미선택 시 Picker
  const sorted = useMemo(() => [...streamers].sort((a, b) => b.totalVolume - a.totalVolume), [streamers]);
  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar bg-[#0B0E14]">
      <p className="text-white font-bold text-sm mb-4">주문할 종목을 선택하세요</p>
      <div className="space-y-2">
        {sorted.map(s => {
          const pct = changePct(s.price);
          return (
            <div key={s.id} onClick={() => onSelectStreamer(s)}
              className="flex items-center px-4 py-3 rounded-xl border cursor-pointer transition-colors bg-[#131924] border-[#222A3A] hover:border-[#3D8BFF]"
            >
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{s.name}</p>
                <p className="text-xs mt-0.5 text-[#626B7A]">{fmtCompact(s.totalVolume)}</p>
              </div>
              <div className="text-right ml-3 shrink-0">
                <p className="font-mono font-bold text-sm" style={{ color: priceColor(pct) }}>{fmt(s.price)}</p>
                <p className="text-xs font-bold mt-0.5" style={{ color: priceColor(pct) }}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
