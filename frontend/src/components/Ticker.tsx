// 상단 티커: 종목 가격과 실시간 거래 이벤트를 가로 스크롤로 보여줍니다.
import { useMemo } from 'react';
import { Stock } from '../hooks/useStocks';
import { LiveTrade } from '../types';
import { changePct, priceColor } from '../utils';

export const Ticker = ({ streamers, liveTrades }: { streamers: Stock[]; liveTrades: LiveTrade[] }) => {
  const items = useMemo(() => {
    const recentIds: string[] = [];
    const seen = new Set<string>();
    for (const t of liveTrades) {
      if (!seen.has(t.streamerId)) {
        seen.add(t.streamerId);
        recentIds.push(t.streamerId);
        if (recentIds.length === 30) break;
      }
    }

    let list: Stock[];
    if (recentIds.length >= 6) {
      list = recentIds.map(id => streamers.find(s => s.id === id)).filter(Boolean) as Stock[];
    } else {
      const active = streamers.filter(s => s.totalVolume > 0);
      list = (active.length >= 6 ? active : streamers.slice(0, 20))
        .sort((a, b) => Math.abs(changePct(b.price, b.basePrice)) - Math.abs(changePct(a.price, a.basePrice)));
    }

    return [...list, ...list];
  }, [streamers, liveTrades]);

  const duration = Math.max(20, (items.length / 2) * 4);

  if (items.length === 0) return null;

  return (
    <div className="relative overflow-hidden shrink-0"
      style={{ background: '#0E121A', borderBottom: '1px solid #222A3A' }}>
      <div className="absolute left-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to right, #0E121A, transparent)' }} />
      <div className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to left, #0E121A, transparent)' }} />
      <div className="flex py-2" style={{ width: 'max-content', animation: `ticker-scroll ${duration}s linear infinite` }}>
        {items.map((s, i) => {
          const pct = changePct(s.price, s.basePrice);
          return (
            <span key={i} className="inline-flex items-center gap-1.5 px-4">
              <span className="text-xs font-bold" style={{ color: '#BAC4D1' }}>{s.name}</span>
              <span className="text-xs font-bold font-mono" style={{ color: priceColor(pct) }}>
                {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
              </span>
              <span className="text-xs" style={{ color: '#26334D' }}>|</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};
