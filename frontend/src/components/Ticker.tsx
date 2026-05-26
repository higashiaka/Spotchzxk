import { useMemo } from 'react';
import { Stock } from '../hooks/useStocks';
import { LiveTrade } from '../types';
import { changePct, priceColor } from '../utils';

/** 상단 수평 스크롤 티커 컴포넌트.
 *  최근 거래 종목 우선으로 종목 가격과 등락률을 무한 가로 스크롤로 표시.
 *  거래 내역이 부족하면 거래량·등락 절댓값 기준 종목으로 채움
 *
 *  Horizontal infinite-scroll ticker at the top of the screen.
 *  Prioritizes recently traded stocks, falling back to volume/change-sorted stocks
 *  when trade history is insufficient */
export const Ticker = ({ streamers, liveTrades }: { streamers: Stock[]; liveTrades: LiveTrade[] }) => {
  /** 표시할 종목 배열 (무한 루프를 위해 2배 복제)
   *  Stock list to display; doubled for seamless infinite-loop animation */
  const items = useMemo(() => {
    // 최근 거래된 종목 ID를 중복 제거해 최대 30개 추출
    // Extract up to 30 unique recently-traded stock IDs
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
      // 거래 이력이 충분하면 최근 거래 순으로 표시
      // Use recently-traded order when history is sufficient
      list = recentIds.map(id => streamers.find(s => s.id === id)).filter(Boolean) as Stock[];
    } else {
      // 거래 이력이 부족하면 등락률 절댓값 내림차순으로 정렬
      // Fall back to stocks sorted by absolute price change when history is sparse
      const active = streamers.filter(s => s.totalVolume > 0);
      list = (active.length >= 6 ? active : streamers.slice(0, 20))
        .sort((a, b) => Math.abs(changePct(b.price, b.basePrice)) - Math.abs(changePct(a.price, a.basePrice)));
    }

    // 무한 루프 애니메이션을 위해 목록을 2배로 복제
    // Double the list for seamless infinite-loop CSS animation
    return [...list, ...list];
  }, [streamers, liveTrades]);

  /** 종목 수에 비례한 스크롤 애니메이션 duration (초)
   *  Scroll animation duration proportional to item count (seconds) */
  const duration = Math.max(20, (items.length / 2) * 4);

  if (items.length === 0) return null;

  return (
    <div className="relative overflow-hidden shrink-0"
      style={{ background: '#0E121A', borderBottom: '1px solid #222A3A' }}>
      {/* 좌우 그라디언트 페이드 오버레이 / Left and right gradient fade overlays */}
      <div className="absolute left-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to right, #0E121A, transparent)' }} />
      <div className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to left, #0E121A, transparent)' }} />

      {/* 스크롤 트랙 / Scrolling track */}
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
