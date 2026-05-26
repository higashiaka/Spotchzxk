import { useState, useMemo } from 'react';
import { Stock } from '../../hooks/useStocks';
import { AppTab } from '../../types';
import { fmt, priceColor, avatarColor } from '../../utils';
import { useHoldings } from '../../hooks/useHoldings';

/** 보유 종목 정렬 기준
 *  Sort key for the holdings list */
type SortKey = 'value' | 'pct' | 'name';

/** 보유 주식 상세 화면 컴포넌트.
 *  전체 보유 종목을 정렬·필터링하여 손익 정보와 함께 표시
 *
 *  Holdings detail screen component.
 *  Displays all held stocks with P&L info; supports sorting. */
export const HoldingsView = ({
  portfolio,
  streamers,
  onNavigate,
  onSelect,
}: {
  /** 포트폴리오 데이터 (잔고·보유주식·평단가) / Portfolio data (balance, shares, avgPrices) */
  portfolio: any;
  /** 전체 종목 목록 (현재가 조회용) / Full stock list for price lookup */
  streamers: Stock[];
  /** 탭 전환 핸들러 / Tab navigation handler */
  onNavigate: (tab: AppTab) => void;
  /** 종목 선택 → 시세 상세로 이동하는 핸들러 / Handler to open stock detail in prices tab */
  onSelect: (s: Stock) => void;
}) => {
  /** 현재 정렬 기준 / Currently selected sort key */
  const [sortKey, setSortKey] = useState<SortKey>('value');

  /** 전체 보유 종목 목록 (DEFAULT_STOCKS 포함, 평가금액 내림차순 기본값)
   *  Full holding list including DEFAULT_STOCKS, default order by market value desc */
  const { holdings, holdingCount } = useHoldings(portfolio, streamers, { includeDefaults: true });

  /** 정렬 기준에 따라 재정렬된 보유 종목 목록
   *  Holdings re-sorted based on the selected sort key */
  const sorted = useMemo(() => {
    return [...holdings].sort((a, b) => {
      if (sortKey === 'value') return b.value - a.value;
      if (sortKey === 'pct')   return b.pct - a.pct;
      if (sortKey === 'name')  return a.streamer.name.localeCompare(b.streamer.name, 'ko');
      return 0;
    });
  }, [holdings, sortKey]);

  /** 전체 보유 주식 평가금액 합산 / Sum of all holdings' market value */
  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
  /** 전체 매입 원금 합산 / Sum of all holdings' cost basis */
  const totalCost  = holdings.reduce((sum, h) => sum + h.avgPrice * h.qty, 0);
  /** 총 손익 금액 / Total profit and loss in KRW */
  const totalPnL   = totalValue - totalCost;
  /** 총 손익률 (%) / Total P&L rate in % */
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  /** 정렬 버튼 목록 / Sort button definitions */
  const SORT_BUTTONS: { key: SortKey; label: string }[] = [
    { key: 'value', label: '평가금액' },
    { key: 'pct',   label: '수익률' },
    { key: 'name',  label: '이름순' },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#080A0F' }}>

      {/* ── 상단 헤더: 뒤로가기 + 제목 ──────────────────────────────
          Top header: back button + title */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ background: '#0E121A', borderBottom: '1px solid #222A3A' }}
      >
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="flex items-center gap-1.5 text-sm font-bold transition-colors hover:opacity-70"
          style={{ color: '#626B7A' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          뒤로
        </button>
        <h1 className="flex-1 text-white text-base font-bold">
          보유 종목
          <span className="ml-2 text-sm font-normal" style={{ color: '#626B7A' }}>
            {holdingCount}개
          </span>
        </h1>
      </div>

      {/* ── 요약 카드: 총 평가금액 · 손익 ────────────────────────────
          Summary card: total market value and P&L */}
      <div
        className="px-4 py-4 shrink-0"
        style={{ background: '#0E121A', borderBottom: '1px solid #222A3A' }}
      >
        <p className="text-xs font-bold mb-1" style={{ color: '#8491A5' }}>총 평가금액</p>
        <p className="text-2xl font-black font-mono text-white mb-1">{fmt(totalValue)}</p>
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-bold font-mono"
            style={{ color: priceColor(totalPnL) }}
          >
            {totalPnL >= 0 ? '+' : ''}{fmt(totalPnL)}
          </span>
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: priceColor(totalPnLPct) + '22',
              color: priceColor(totalPnLPct),
            }}
          >
            {totalPnLPct >= 0 ? '+' : ''}{totalPnLPct.toFixed(2)}%
          </span>
          <span className="text-xs" style={{ color: '#626B7A' }}>매입 대비</span>
        </div>
      </div>

      {/* ── 정렬 버튼 바 ─────────────────────────────────────────────
          Sort button bar */}
      <div
        className="flex items-center gap-1 px-4 py-2.5 shrink-0"
        style={{ background: '#0B0E14', borderBottom: '1px solid #1A2232' }}
      >
        <span className="text-xs mr-1" style={{ color: '#626B7A' }}>정렬:</span>
        {SORT_BUTTONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSortKey(key)}
            className="px-2.5 py-1 rounded-full text-xs font-bold transition-colors"
            style={{
              background:   sortKey === key ? '#00E67622' : '#1A2232',
              color:        sortKey === key ? '#00E676'   : '#626B7A',
              border:       sortKey === key ? '1px solid #00E67644' : '1px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 보유 종목 목록 ────────────────────────────────────────────
          Holdings list */}
      <div className="flex-1 overflow-y-auto hide-scrollbar pb-24">
        {sorted.length === 0 ? (
          /* 보유 종목 없음 상태 / Empty state */
          <div
            className="flex flex-col items-center justify-center h-full gap-3"
            style={{ color: '#626B7A' }}
          >
            <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm">보유 종목이 없습니다.</p>
            <button
              type="button"
              onClick={() => onNavigate('prices')}
              className="text-xs font-bold px-4 py-2 rounded-xl"
              style={{ background: '#1A2232', color: '#BAC4D1' }}
            >
              시세 화면으로 이동 ›
            </button>
          </div>
        ) : (
          sorted.map((h) => {
            const { streamer: s, qty, value, pct, avgPrice } = h;
            /** 주당 손익 / Per-share P&L */
            const pnlPerShare = s.price - avgPrice;
            /** 총 손익 금액 / Total P&L in KRW */
            const pnlTotal    = pnlPerShare * qty;

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s)}
                className="w-full flex items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-white/5 active:bg-white/10"
                style={{ borderBottom: '1px solid #1A2232' }}
              >
                {/* 아바타 / Avatar */}
                <div
                  className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-black overflow-hidden"
                  style={{ backgroundColor: s.profileImageUrl ? 'transparent' : avatarColor(s.name) }}
                >
                  {s.profileImageUrl
                    ? <img src={s.profileImageUrl} alt={s.name} className="w-full h-full object-cover" />
                    : s.name.slice(0, 2)}
                </div>

                {/* 종목명 + 보유 정보 / Name + holding info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-white text-sm font-bold truncate">{s.name}</p>
                    {s.isLive && (
                      <span
                        className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0"
                        style={{ background: '#FF4444', color: '#fff' }}
                      >
                        LIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono" style={{ color: '#626B7A' }}>
                    {qty}주 &nbsp;·&nbsp; 평단 {fmt(avgPrice)}
                  </p>
                </div>

                {/* 평가금액 + 손익 / Market value + P&L */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold font-mono text-white mb-0.5">
                    {fmt(value)}
                  </p>
                  <p className="text-xs font-bold font-mono" style={{ color: priceColor(pct) }}>
                    {pnlTotal >= 0 ? '+' : ''}{fmt(pnlTotal)}&nbsp;
                    <span className="font-normal">
                      ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                    </span>
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
