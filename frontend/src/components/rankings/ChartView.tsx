import { useEffect, useMemo, useState } from 'react';
import { Stock } from '../../hooks/useStocks';
import { avatarColor, changePct, fmt, fmtCompact, priceColor } from '../../utils';

/** 차트 화면에서 선택 가능한 카테고리 타입
 *  Category types selectable in the chart screen */
type ChartCategory = 'volume' | 'value' | 'surge' | 'drop' | 'new' | 'dividend';

/** 차트/랭킹 화면 컴포넌트.
 *  카테고리(거래량·거래대금·급상승·급하락·신규상장·배당)별로
 *  종목을 정렬하고 랭킹 형태로 표시
 *
 *  Chart/ranking screen component.
 *  Sorts and displays stocks in ranking form by category
 *  (volume, value, surge, drop, new listing, dividend) */
export const ChartView = ({
  streamers,
  onSelect,
}: {
  /** 전체 종목 목록 / Full list of stocks */
  streamers: Stock[];
  /** 종목 선택 시 상세 화면으로 이동하는 핸들러 / Handler to navigate to stock detail on selection */
  onSelect: (s: Stock) => void;
}) => {
  /** 현재 선택된 카테고리 / Currently selected category */
  const [category, setCategory] = useState<ChartCategory>('volume');
  /** 거래량 정렬 방향 (false=내림차순, true=오름차순) / Volume sort direction (false=desc, true=asc) */
  const [volumeAsc, setVolumeAsc] = useState(false);
  /** 거래대금 정렬 방향 / Value sort direction */
  const [valueAsc, setValueAsc] = useState(false);
  /** 배당 카운트다운 갱신용 1초 틱 / 1-second tick for updating dividend countdown */
  const [tick, setTick] = useState(0);

  // 배당 카테고리 선택 시 1초 인터벌로 카운트다운 갱신
  // Start 1s interval to refresh countdown when dividend category is selected
  useEffect(() => {
    if (category !== 'dividend') return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [category]);

  /** 카테고리 버튼 클릭 핸들러.
   *  같은 카테고리를 재클릭하면 정렬 방향을 토글
   *  Category button click handler.
   *  Toggles sort direction when the same category is clicked again */
  const handleCategoryClick = (key: ChartCategory) => {
    if (key === 'volume' && category === 'volume') {
      setVolumeAsc(v => !v);
    } else if (key === 'value' && category === 'value') {
      setValueAsc(v => !v);
    } else {
      setCategory(key);
    }
  };

  const volumeLabel = `거래량 ${volumeAsc ? '오름' : '내림'}`;
  const valueLabel = `거래대금 ${valueAsc ? '오름' : '내림'}`;

  /** 카테고리 버튼 정의 목록 / Category button definitions */
  const CATEGORIES: { key: ChartCategory; label: string }[] = [
    { key: 'volume',   label: volumeLabel },
    { key: 'value',    label: valueLabel },
    { key: 'surge',    label: '급상승' },
    { key: 'drop',     label: '급하락' },
    { key: 'new',      label: '신규상장' },
    { key: 'dividend', label: '배당' },
  ];

  /** 카테고리별 필터링·정렬된 최대 30개 종목 목록
   *  Up to 30 stocks filtered and sorted by the selected category */
  const list = useMemo(() => {
    const s = [...streamers];
    const remainingMs = (st: Stock): number => {
      if (!st.isLive || !st.liveStartedAt) return Number.POSITIVE_INFINITY;
      const startMs = new Date(st.liveStartedAt).getTime();
      const nextMs = ((st.dividendAccumulationCount ?? 0) + 1) * 10 * 60 * 1000;
      return nextMs - (Date.now() - startMs);
    };

    void tick;
    switch (category) {
      case 'volume':
        return volumeAsc
          ? s.sort((a, b) => a.totalVolume - b.totalVolume).slice(0, 30)
          : s.sort((a, b) => b.totalVolume - a.totalVolume).slice(0, 30);
      case 'value':
        return valueAsc
          ? s.sort((a, b) => a.price * a.totalVolume - b.price * b.totalVolume).slice(0, 30)
          : s.sort((a, b) => b.price * b.totalVolume - a.price * a.totalVolume).slice(0, 30);
      case 'surge':
        return s
          .filter(st => changePct(st.price, st.basePrice) > 0)
          .sort((a, b) => changePct(b.price, b.basePrice) - changePct(a.price, a.basePrice))
          .slice(0, 30);
      case 'drop':
        return s
          .filter(st => changePct(st.price, st.basePrice) < 0)
          .sort((a, b) => changePct(a.price, a.basePrice) - changePct(b.price, b.basePrice))
          .slice(0, 30);
      case 'new': {
        // 오늘 상장된 종목만 필터링 / Filter only stocks listed today
        const today = new Date();
        const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
        return s
          .filter(st => {
            if (!st.listedAt) return false;
            const ld = new Date(st.listedAt);
            return ld.getFullYear() === y && ld.getMonth() === m && ld.getDate() === d;
          })
          .slice(0, 30);
      }
      case 'dividend':
        // 현재 라이브 중인 종목을 다음 배당까지 남은 시간 오름차순으로 표시
        // Show live stocks sorted by remaining time until next dividend ascending
        return s.filter(st => st.isLive).sort((a, b) => remainingMs(a) - remainingMs(b));
      default:
        return s.slice(0, 30);
    }
  }, [streamers, category, volumeAsc, valueAsc, tick]);

  /** 카테고리에 따른 오른쪽 컬럼 헤더 라벨
   *  Right column header label based on current category */
  const colLabel = category === 'value' ? '거래대금' : category === 'dividend' ? '다음 배당' : '거래량';

  /** 다음 배당까지 남은 밀리초 계산.
   *  라이브 중이 아니거나 시작 시각 없으면 -1 반환
   *  Calculates milliseconds remaining until next dividend.
   *  Returns -1 if not live or no start time */
  const dividendRemainingMs = (s: Stock): number => {
    if (!s.isLive || !s.liveStartedAt) return -1;
    void tick; // tick 참조로 1초마다 리렌더 유도 / Reference tick to force re-render every second
    const startMs = new Date(s.liveStartedAt).getTime();
    const nextMs = ((s.dividendAccumulationCount ?? 0) + 1) * 10 * 60 * 1000;
    return nextMs - (Date.now() - startMs);
  };

  /** 남은 밀리초를 mm:ss 형식의 문자열로 변환
   *  Converts remaining ms to mm:ss string */
  const fmtRemaining = (ms: number): string => {
    if (ms <= 0) return '곧 지급';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /** 주당 예상 배당금 문자열 (현재가 × 0.7%)
   *  Expected dividend per share string (current price × 0.7%) */
  const expectedPerShare = (s: Stock): string => {
    const val = s.price * 0.007;
    return val >= 1 ? `+${Math.floor(val)}코인` : `+${val.toFixed(4)}`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 카테고리 선택 버튼 바 / Category selector button bar */}
      <div
        className="flex gap-2 px-4 py-3 shrink-0 overflow-x-auto hide-scrollbar"
        style={{ borderBottom: '1px solid #222A3A' }}
      >
        {CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleCategoryClick(key)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
            style={{
              background: category === key ? '#00E676' : 'var(--bg-card-secondary)',
              color: category === key ? 'var(--accent-foreground)' : 'var(--text-muted)',
              border: '1px solid',
              borderColor: category === key ? '#00E676' : 'var(--border-primary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 컬럼 헤더 / Column headers */}
      <div
        className="flex items-center px-4 py-2 shrink-0 text-xs font-bold uppercase tracking-wider"
        style={{ color: 'var(--text-dim)', borderBottom: '1px solid #1A2232', background: 'var(--bg-sidebar)' }}
      >
        <span className="w-6 mr-3 text-center">#</span>
        <span className="flex-1">스트리머</span>
        <span className="w-24 text-right">현재가</span>
        {category !== 'dividend' && <span className="w-16 text-right">등락률</span>}
        <span className={`${category === 'dividend' ? 'w-28' : 'w-24'} text-right`}>{colLabel}</span>
      </div>

      {/* 종목 랭킹 행 목록 / Stock ranking row list */}
      <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar touch-pan-y">
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
                className="flex items-center px-4 py-3 cursor-pointer"
                style={{ borderBottom: '1px solid #1A2232' }}
              >
                {/* 순위 번호 (상위 3위는 밝은 색) / Rank number (brighter for top 3) */}
                <span
                  className="w-6 mr-3 text-sm font-bold text-center shrink-0"
                  style={{ color: i < 3 ? 'var(--text-secondary)' : 'var(--text-dim)' }}
                >
                  {i + 1}
                </span>
                {/* 프로필 이미지 또는 이니셜 + 종목명 / Profile image or initials + stock name */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black overflow-hidden"
                    style={{ backgroundColor: s.profileImageUrl ? 'transparent' : avatarColor(s.name) }}
                  >
                    {s.profileImageUrl ? (
                      <img src={s.profileImageUrl} alt={s.name} className="w-full h-full object-cover" />
                    ) : (
                      s.name.slice(0, 2)
                    )}
                  </div>
                  <p className="text-white text-sm font-bold truncate">{s.name}</p>
                </div>
                {/* 현재가 / Current price */}
                <div className="w-24 text-right shrink-0">
                  <p className="font-mono text-sm font-bold" style={{ color: priceColor(pct) }}>{fmt(s.price)}</p>
                </div>
                {/* 등락률 (배당 카테고리 제외) / Change rate (hidden for dividend category) */}
                {category !== 'dividend' && (
                  <div className="w-16 text-right shrink-0">
                    <p className="text-xs font-bold" style={{ color: priceColor(pct) }}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                    </p>
                  </div>
                )}
                {/* 카테고리별 우측 컬럼 값 / Right column value based on category */}
                {category === 'dividend' ? (
                  <div className="w-28 text-right shrink-0">
                    <p className="text-xs font-bold font-mono" style={{ color: '#00E676' }}>
                      {fmtRemaining(dividendRemainingMs(s))}
                    </p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {expectedPerShare(s)}/주
                    </p>
                  </div>
                ) : (
                  <div className="w-24 text-right shrink-0">
                    <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {category === 'value' ? fmt(s.price * s.totalVolume) : fmtCompact(s.totalVolume)}
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
