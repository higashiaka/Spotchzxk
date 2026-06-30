import { useState, useMemo, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { changePct, priceColorClass, fmt, fmtCompact, fmtPct } from '../../utils';
import { LegalFooter } from '../legal/LegalFooter';
import { OrderForm } from './OrderForm';

/** Order screen component.
 *  Shows OrderForm when a stock is selected; otherwise shows
 *  the stock list sorted by trading volume */
export const OrderView = ({
  streamers, selectedStreamer, user, initialOrderType, onSelectStreamer, onBack,
}: {
  /** Full list of stocks */
  streamers: Stock[];
  /** Currently selected stock, null if none */
  selectedStreamer: Stock | null;
  /** Authenticated user, null if not logged in */
  user: User | null;
  /** Initial order direction when entering the order screen */
  initialOrderType: 'buy' | 'sell';
  /** Stock selection handler */
  onSelectStreamer: (s: Stock) => void;
  onBack: () => void;
}) => {
  /** Order quantity as string state */
  const [qtyStr, setQtyStr] = useState('1');
  /** Order direction state (buy or sell) */
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  /** Previously selected stock ID; used to detect stock changes and reset quantity */
  const [prevId, setPrevId] = useState<string | null>(null);

  useEffect(() => {
    setOrderType(initialOrderType);
  }, [initialOrderType]);

  // Reset quantity to 1 when the selected stock changes
  useEffect(() => {
    if (!selectedStreamer) {
      setPrevId(null);
      return;
    }
    if (selectedStreamer.id === prevId) return;
    setPrevId(selectedStreamer.id);
    setQtyStr('1');
  }, [selectedStreamer, prevId]);

  const sorted = useMemo(() => [...streamers].sort((a, b) => b.totalVolume - a.totalVolume), [streamers]);
  const activeStreamer = useMemo(() => {
    if (!selectedStreamer) return null;
    return streamers.find(s => s.id === selectedStreamer.id) ?? selectedStreamer;
  }, [selectedStreamer, streamers]);

  // Render OrderForm when a stock is selected
  if (activeStreamer) {
    return (
      <div className="h-full flex flex-col overflow-hidden surface-sidebar">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 shrink-0 text-sm font-bold transition-colors hover:opacity-70"
          style={{ color: 'var(--text-dim)', borderBottom: '1px solid #222A3A', background: 'var(--bg-sidebar)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
          이전 화면
        </button>
        <div className="flex-1 overflow-hidden">
          <OrderForm
            streamer={activeStreamer}
            user={user}
            qtyStr={qtyStr}
            setQtyStr={setQtyStr}
            orderType={orderType}
            setOrderType={setOrderType}
          />
        </div>
      </div>
    );
  }

  /** Stocks sorted by volume descending */
  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar surface-sidebar">
      <p className="text-white font-bold text-sm mb-4">주문할 종목을 선택하세요</p>
      <div className="space-y-2">
        {sorted.map(s => {
          const pct = changePct(s.price);
          return (
            <button key={s.id} type="button" onClick={() => onSelectStreamer(s)}
              className="w-full text-left flex items-center px-4 py-3 rounded-xl border cursor-pointer transition-colors hover:border-[#3D8BFF] surface-card-secondary border-primary-token">
              {/* Stock name and volume */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{s.name}</p>
                <p className="text-xs mt-0.5 text-[var(--text-dim)]">{fmtCompact(s.totalVolume)}</p>
              </div>
              {/* Current price and change rate */}
              <div className="text-right ml-3 shrink-0">
                <p className={`font-mono font-bold text-sm ${priceColorClass(pct)}`}>{fmt(s.price)}</p>
                <p className={`text-xs font-bold mt-0.5 whitespace-nowrap ${priceColorClass(pct)}`}>
                  {fmtPct(pct, 1)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <LegalFooter />
    </div>
  );
};
