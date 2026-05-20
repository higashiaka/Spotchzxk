import { useMemo } from 'react';
import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { changePct, priceColor, fmt, fmtCompact } from '../../utils';
import { OrderForm } from './OrderForm';

export const OrderView = ({
  streamers, selectedStreamer, user, onSelectStreamer,
}: {
  streamers: Stock[];
  selectedStreamer: Stock | null;
  user: User | null;
  onSelectStreamer: (s: Stock) => void;
}) => {
  if (selectedStreamer) {
    return <OrderForm streamer={selectedStreamer} user={user} />;
  }

  // 종목 미선택 시 picker
  const sorted = useMemo(() => [...streamers].sort((a, b) => b.totalVolume - a.totalVolume), [streamers]);
  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar">
      <p className="text-white font-bold text-sm mb-4">주문할 종목을 선택하세요</p>
      <div className="space-y-2">
        {sorted.map(s => {
          const pct = changePct(s.price);
          return (
            <div key={s.id} onClick={() => onSelectStreamer(s)}
              className="flex items-center px-4 py-3 rounded-xl border cursor-pointer transition-colors hover:border-blue-500"
              style={{ background: '#131924', borderColor: '#222A3A' }}>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{s.name}</p>
                <p className="text-xs mt-0.5" style={{ color: '#626B7A' }}>{fmtCompact(s.totalVolume)}</p>
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
