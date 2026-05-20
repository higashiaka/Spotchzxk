import { useState, useMemo } from 'react';
import { Stock } from '../../hooks/useStocks';
import { AppTab, LiveTrade } from '../../types';
import { changePct, priceColor, avatarColor, fmt, fmtCompact } from '../../utils';
import { StockDetail } from './StockDetail';

export const PricesView = ({
  streamers, selectedStreamer, onSelectStreamer, onNavigate, liveTrades,
}: {
  streamers: Stock[];
  selectedStreamer: Stock | null;
  onSelectStreamer: (s: Stock | null) => void;
  onNavigate: (tab: AppTab) => void;
  liveTrades: LiveTrade[];
}) => {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    let s = streamers;
    if (search) s = s.filter(st => st.name.toLowerCase().includes(search.toLowerCase()));
    return [...s].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [streamers, search]);

  if (selectedStreamer) {
    return (
      <StockDetail
        streamer={selectedStreamer}
        onBack={() => onSelectStreamer(null)}
        onOrder={() => onNavigate('order')}
        liveTrades={liveTrades}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar">
      <div className="relative mb-4">
        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#626B7A' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="종목명으로 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border text-white text-sm focus:outline-none"
          style={{ background: '#131924', borderColor: '#222A3A' }}
        />
      </div>

      <div className="flex items-center text-xs font-bold uppercase tracking-wider px-4 mb-2" style={{ color: '#626B7A' }}>
        <span className="flex-1">종목명</span>
        <span className="w-28 text-right">현재가</span>
        <span className="w-16 text-right">등락률</span>
      </div>

      <div className="space-y-1">
        {filtered.map(s => {
          const pct = changePct(s.price, s.basePrice);
          return (
            <div key={s.id} onClick={() => onSelectStreamer(s)}
              className="flex items-center px-4 py-3 rounded-xl border cursor-pointer transition-colors hover:border-blue-500"
              style={{ background: '#131924', borderColor: '#222A3A' }}>
              <div className="shrink-0 mr-3"
                style={{ padding: 2, borderRadius: '50%', background: s.isLive ? '#22C55E' : 'transparent' }}>
                <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-black"
                  style={{ backgroundColor: s.profileImageUrl ? 'transparent' : avatarColor(s.name) }}>
                  {s.profileImageUrl
                    ? <img src={s.profileImageUrl} alt={s.name} className="w-full h-full object-cover" />
                    : s.name.slice(0, 2)
                  }
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-white text-sm font-bold truncate">{s.name}</p>
                  {s.isLive && (
                    <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: '#FF3B3B26', color: '#FF3B3B' }}>
                      LIVE
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: '#626B7A' }}>{fmtCompact(s.totalVolume)}</p>
              </div>
              <div className="w-28 text-right">
                <p className="font-mono text-sm font-bold" style={{ color: priceColor(pct) }}>{fmt(s.price)}</p>
              </div>
              <div className="w-16 text-right">
                <p className="text-xs font-bold" style={{ color: priceColor(pct) }}>
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
