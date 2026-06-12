import { UIEvent, useEffect, useMemo, useState } from 'react';
import { Stock } from '../../hooks/useStocks';
import { avatarColor, changePct, fmt, fmtCompact, fmtCompactWon, priceColor, fmtPct } from '../../utils';

/** Category types selectable in the chart screen */
type ChartCategory = 'volume' | 'value' | 'surge' | 'drop' | 'new' | 'dividend';

const PAGE_SIZE = 30;
const DIVIDEND_INTERVAL_MS = 60 * 60 * 1000;

const dividendRemainingMsFor = (s: Stock): number => {
  if (!s.isLive || !s.liveStartedAt) return Number.NaN;
  const startMs = new Date(s.liveStartedAt).getTime();
  if (!Number.isFinite(startMs)) return Number.NaN;
  const elapsedMs = Date.now() - startMs;
  const completedIntervals = Math.max(0, Math.floor(elapsedMs / DIVIDEND_INTERVAL_MS));
  const recordedIntervals = s.dividendAccumulationCount ?? 0;
  const effectiveIntervals = Math.min(recordedIntervals, completedIntervals);
  const nextMs = (effectiveIntervals + 1) * DIVIDEND_INTERVAL_MS;
  return nextMs - elapsedMs;
};

/** Chart/ranking screen component.
 *  Sorts and displays stocks in ranking form by category
 *  (volume, value, surge, drop, new listing, dividend) */
export const ChartView = ({
  streamers,
  onSelect,
}: {
  /** Full list of stocks */
  streamers: Stock[];
  /** Handler to navigate to stock detail on selection */
  onSelect: (s: Stock) => void;
}) => {
  /** Currently selected category */
  const [category, setCategory] = useState<ChartCategory>('volume');
  /** Volume sort direction (false=desc, true=asc) */
  const [volumeAsc, setVolumeAsc] = useState(false);
  /** Value sort direction */
  const [valueAsc, setValueAsc] = useState(false);
  /** Price movement toggle direction (true=surge, false=drop) */
  const [surgeAsc, setSurgeAsc] = useState(false);
  /** Number of ranking rows currently visible */
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  /** 1-second tick for updating dividend countdown */
  const [tick, setTick] = useState(0);

  // Start 1s interval to refresh countdown when dividend category is selected
  useEffect(() => {
    if (category !== 'dividend') return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [category]);

  /** Category button click handler.
   *  Toggles sort direction when the same category is clicked again */
  const handleCategoryClick = (key: ChartCategory | 'price') => {
    if (key === 'volume' && category === 'volume') {
      setVolumeAsc(v => !v);
    } else if (key === 'value' && category === 'value') {
      setValueAsc(v => !v);
    } else if (key === 'price') {
      if (category === 'surge' || category === 'drop') {
        setSurgeAsc(v => {
          const next = !v;
          setCategory(next ? 'surge' : 'drop');
          return next;
        });
      } else {
        setCategory(surgeAsc ? 'surge' : 'drop');
      }
    } else {
      setCategory(key);
    }
  };

  const volumeLabel = `거래량 ${volumeAsc ? '↑' : '↓'}`;
  const valueLabel = `거래대금 ${valueAsc ? '↑' : '↓'}`;
  const priceLabel = `급${surgeAsc ? '상승' : '하락'}`;

  /** Category button definitions */
  const CATEGORIES: { key: ChartCategory | 'price'; label: string }[] = [
    { key: 'volume',   label: volumeLabel },
    { key: 'value',    label: valueLabel },
    { key: 'price',    label: priceLabel },
    { key: 'new',      label: '신규상장' },
    { key: 'dividend', label: '배당' },
  ];

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [category, volumeAsc, valueAsc, surgeAsc]);

  /** All stocks filtered and sorted by the selected category */
  const rankedList = useMemo(() => {
    const s = [...streamers];
    const remainingMs = (st: Stock): number => {
      const ms = dividendRemainingMsFor(st);
      return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
    };

    void tick;
    switch (category) {
      case 'volume':
        return volumeAsc
          ? s.sort((a, b) => a.totalVolume - b.totalVolume)
          : s.sort((a, b) => b.totalVolume - a.totalVolume);
      case 'value':
        return valueAsc
          ? s.sort((a, b) => a.dailyTradingValue - b.dailyTradingValue)
          : s.sort((a, b) => b.dailyTradingValue - a.dailyTradingValue);
      case 'surge':
        return s
          .filter(st => changePct(st.price, st.basePrice) > 0)
          .sort((a, b) => changePct(b.price, b.basePrice) - changePct(a.price, a.basePrice));
      case 'drop':
        return s
          .filter(st => changePct(st.price, st.basePrice) < 0)
          .sort((a, b) => changePct(a.price, a.basePrice) - changePct(b.price, b.basePrice));
      case 'new': {
        // Filter only stocks listed today
        const today = new Date();
        const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
        return s
          .filter(st => {
            if (!st.listedAt) return false;
            const ld = new Date(st.listedAt);
            return ld.getFullYear() === y && ld.getMonth() === m && ld.getDate() === d;
          })
      }
      case 'dividend':
        // Show live stocks sorted by remaining time until next dividend ascending
        return s.filter(st => st.isLive).sort((a, b) => remainingMs(a) - remainingMs(b));
      default:
        return s;
    }
  }, [streamers, category, volumeAsc, valueAsc, tick]);

  const list = useMemo(() => rankedList.slice(0, visibleCount), [rankedList, visibleCount]);
  const hasMore = visibleCount < rankedList.length;

  const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMore) return;
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining < 160) {
      setVisibleCount(count => Math.min(count + PAGE_SIZE, rankedList.length));
    }
  };

  /** Right column header label based on current category */
  const colLabel = category === 'value' ? '거래대금' : category === 'dividend' ? '다음 배당' : '거래량';

  /** Calculates milliseconds remaining until next dividend.
   *  Returns -1 if not live or no start time */
  const dividendRemainingMs = (s: Stock): number => {
    void tick; // Reference tick to force re-render every second
    return dividendRemainingMsFor(s);
  };

  /** Converts remaining ms to mm:ss string */
  const fmtRemaining = (ms: number): string => {
    if (!Number.isFinite(ms)) return '-';
    if (ms <= 0) return '곧 지급';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /** Expected dividend per share string (current price × 0.7%) */
  const expectedPerShare = (s: Stock): string => {
    const val = s.price * 0.007;
    return val >= 1 ? `+${Math.floor(val)}원` : `+${val.toFixed(4)}원`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden w-full max-w-6xl mx-auto">
      {/* Category selector button bar */}
      <div
        className="flex gap-2 md:gap-3 px-4 py-3 md:px-8 md:py-5 shrink-0 overflow-x-auto hide-scrollbar"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        {CATEGORIES.map(({ key, label }) => {
          const active = key === 'price' ? category === 'surge' || category === 'drop' : category === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleCategoryClick(key)}
              className="shrink-0 px-3 py-1.5 md:px-5 md:py-3 rounded-full text-xs md:text-sm font-bold transition-colors"
              style={{
                background: active ? 'var(--accent)' : 'var(--bg-card-secondary)',
                color: active ? 'var(--accent-foreground)' : 'var(--text-muted)',
                border: '1px solid',
                borderColor: active ? 'var(--accent)' : 'var(--border-primary)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Column headers */}
      <div
        className="flex items-center px-4 py-2 md:px-8 md:py-3 shrink-0 text-xs md:text-sm font-bold uppercase tracking-wider"
        style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border-card)', background: 'var(--bg-sidebar)' }}
      >
        <span className="w-6 md:w-10 mr-3 md:mr-5 text-center">#</span>
        <span className="flex-1">스트리머</span>
        <span className="w-24 md:w-36 text-right">현재가</span>
        {category !== 'dividend' && <span className="w-16 md:w-24 text-right">등락률</span>}
        <span className={`${category === 'dividend' ? 'w-28 md:w-40' : 'w-24 md:w-36'} text-right`}>{colLabel}</span>
      </div>

      {/* Stock ranking row list */}
      <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar touch-pan-y" onScroll={handleListScroll}>
        {list.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--text-dim)' }}>
            데이터가 없습니다
          </div>
        ) : (
          list.map((s, i) => {
            const pct = changePct(s.price, s.basePrice);
            return (
              <div
                key={s.id}
                onClick={() => onSelect(s)}
                className="flex items-center px-4 py-3 md:px-8 md:py-5 cursor-pointer"
                style={{ borderBottom: '1px solid var(--border-card)' }}
              >
                {/* Rank number (brighter for top 3) */}
                <span
                  className="w-6 md:w-10 mr-3 md:mr-5 text-sm md:text-lg font-bold text-center shrink-0"
                  style={{ color: i < 3 ? 'var(--text-secondary)' : 'var(--text-dim)' }}
                >
                  {i + 1}
                </span>
                {/* Profile image or initials + stock name */}
                <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
                  <div
                    className="w-8 h-8 md:w-12 md:h-12 rounded-full flex items-center justify-center shrink-0 text-white text-xs md:text-base font-black overflow-hidden"
                    style={{ backgroundColor: s.profileImageUrl ? 'transparent' : avatarColor(s.name) }}
                  >
                    {s.profileImageUrl ? (
                      <img src={s.profileImageUrl} alt={s.name} className="w-full h-full object-cover" />
                    ) : (
                      s.name.slice(0, 2)
                    )}
                  </div>
                  <p className="text-white text-sm md:text-lg font-bold truncate">{s.name}</p>
                </div>
                {/* Current price */}
                <div className="w-24 md:w-36 text-right shrink-0">
                  <p className="font-mono text-sm md:text-lg font-bold" style={{ color: priceColor(pct) }}>{fmt(s.price)}</p>
                </div>
                {/* Change rate (hidden for dividend category) */}
                {category !== 'dividend' && (
                  <div className="w-16 md:w-24 text-right shrink-0">
                    <p className="text-xs md:text-base font-bold" style={{ color: priceColor(pct) }}>
                      {fmtPct(pct, 1)}
                    </p>
                  </div>
                )}
                {/* Right column value based on category */}
                {category === 'dividend' ? (
                  <div className="w-28 md:w-40 text-right shrink-0">
                    <p className="text-xs md:text-base font-bold font-mono" style={{ color: 'var(--accent)' }}>
                      {fmtRemaining(dividendRemainingMs(s))}
                    </p>
                    <p className="text-xs md:text-sm font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {expectedPerShare(s)}/주
                    </p>
                  </div>
                ) : (
                  <div className="w-24 md:w-36 text-right shrink-0">
                    <p className="text-xs md:text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
                      {category === 'value' ? fmtCompactWon(s.dailyTradingValue) : fmtCompact(s.totalVolume)}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
