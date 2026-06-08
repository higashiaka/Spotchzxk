import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Stock } from '../hooks/useStocks';
import { LiveTrade } from '../types';
import { changePct, priceColorClass } from '../utils';

/** Horizontal infinite-scroll ticker at the top of the screen.
 *  Prioritizes recently traded stocks, falling back to volume/change-sorted stocks
 *  when trade history is insufficient */
export const Ticker = ({ streamers, liveTrades }: { streamers: Stock[]; liveTrades: LiveTrade[] }) => {
  /** Stock list doubled for seamless loop */
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

  /** Scroll duration proportional to item count */
  const duration = Math.max(20, (items.length / 2) * 4);

  if (items.length === 0) return null;

  return (
    <div className="relative overflow-hidden shrink-0 surface-sidebar border-bottom-primary">
      {/* Left and right gradient fade overlays */}
      <div className="absolute left-0 top-0 bottom-0 w-10 z-10 pointer-events-none ticker-fade-left" />
      <div className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none ticker-fade-right" />

      {/* Scrolling track */}
      <div className="flex py-2 ticker-track" style={{ '--ticker-duration': `${duration}s` } as CSSProperties}>
        {items.map((s, i) => {
          const pct = changePct(s.price, s.basePrice);
          return (
            <span key={i} className="inline-flex items-center gap-1.5 px-4">
              <span className="text-xs font-bold text-secondary-token">{s.name}</span>
              <span className={`text-xs font-bold font-mono ${priceColorClass(pct)}`}>
                {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
              </span>
              <span className="text-xs text-[var(--border-secondary)]">|</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};
