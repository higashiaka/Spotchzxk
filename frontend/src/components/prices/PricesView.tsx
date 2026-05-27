import { useState, useMemo } from 'react';
import { Stock } from '../../hooks/useStocks';
import { AppTab, LiveTrade } from '../../types';
import { changePct, priceColor, avatarColor, fmt, fmtCompact } from '../../utils';
import { StockDetail } from './StockDetail';

/** 시세 화면 컴포넌트.
 *  종목이 선택되지 않은 경우 검색 가능한 종목 목록을 표시하고,
 *  종목을 선택하면 StockDetail로 전환
 *
 *  Prices screen component.
 *  Shows a searchable stock list when no stock is selected;
 *  switches to StockDetail when a stock is selected */
export const PricesView = ({
  streamers, selectedStreamer, onSelectStreamer, onNavigate, liveTrades,
}: {
  /** 전체 종목 목록 / Full list of stocks */
  streamers: Stock[];
  /** 현재 선택된 종목 (없으면 null) / Currently selected stock, null if none */
  selectedStreamer: Stock | null;
  /** 종목 선택/해제 핸들러 / Handler to select or deselect a stock */
  onSelectStreamer: (s: Stock | null) => void;
  /** 탭 전환 핸들러 / Tab navigation handler */
  onNavigate: (tab: AppTab) => void;
  /** 실시간 체결 내역 (StockDetail로 전달) / Live trades passed down to StockDetail */
  liveTrades: LiveTrade[];
}) => {
  /** 검색어 상태 / Search input state */
  const [search, setSearch] = useState('');

  /** 검색어로 필터링 후 한국어 가나다순 정렬한 종목 목록
   *  Stocks filtered by search term and sorted in Korean alphabetical order */
  const filtered = useMemo(() => {
    let s = streamers;
    if (search) s = s.filter(st => st.name.toLowerCase().includes(search.toLowerCase()));
    return [...s].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [streamers, search]);

  // 종목이 선택된 경우 상세 화면으로 전환 / Switch to detail view when a stock is selected
  if (selectedStreamer) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* 목록으로 돌아가는 뒤로가기 버튼 / Back button to return to the stock list */}
        <button
          type="button"
          onClick={() => onSelectStreamer(null)}
          className="flex items-center gap-1.5 px-4 py-2.5 shrink-0 text-sm font-bold transition-colors hover:opacity-70"
          style={{ color: 'var(--text-dim)', borderBottom: '1px solid #222A3A', background: 'var(--bg-sidebar)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
          시세 목록
        </button>
        <div className="flex-1 overflow-hidden">
          <StockDetail
            streamer={selectedStreamer}
            onOrder={() => onNavigate('order')}
            liveTrades={liveTrades}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar">
      {/* 종목 검색 입력 / Stock search input */}
      <div className="relative mb-4">
        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }}
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
          style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}
        />
      </div>

      {/* 컬럼 헤더 / Column headers */}
      <div className="flex items-center text-xs font-bold uppercase tracking-wider px-4 mb-2" style={{ color: 'var(--text-dim)' }}>
        <span className="flex-1">종목명</span>
        <span className="w-28 text-right">현재가</span>
        <span className="w-16 text-right">등락률</span>
      </div>

      {/* 종목 행 목록 / Stock row list */}
      <div className="space-y-1">
        {filtered.map(s => {
          const pct = changePct(s.price, s.basePrice);
          return (
            <div key={s.id} onClick={() => onSelectStreamer(s)}
              className="flex items-center px-4 py-3 rounded-xl border cursor-pointer transition-colors hover:border-blue-500"
              style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
              {/* 라이브 중이면 녹색 링 테두리 / Green ring border when streamer is live */}
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
                {/* 거래량 요약 / Volume summary */}
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{fmtCompact(s.totalVolume)}</p>
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
