import { useState, useMemo, useEffect } from 'react';
import { Stock } from '../../hooks/useStocks';
import { changePct, priceColor, fmt, fmtCompact, avatarColor } from '../../utils';

type ChartCategory = 'volume' | 'value' | 'surge' | 'drop' | 'new' | 'dividend';

export const ChartView = ({
  streamers,
  onSelect,
}: {
  streamers: Stock[];
  onSelect: (s: Stock) => void;
}) => {
  const [category, setCategory] = useState<ChartCategory>('volume');
  const [volumeAsc, setVolumeAsc] = useState(false);
  const [valueAsc, setValueAsc] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (category !== 'dividend') return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [category]);

  const handleCategoryClick = (key: ChartCategory) => {
    if (key === 'volume' && category === 'volume') {
      setVolumeAsc(v => !v);
    } else if (key === 'value' && category === 'value') {
      setValueAsc(v => !v);
    } else {
      setCategory(key);
    }
  };

  const volumeLabel = `거래량${volumeAsc ? '↓' : '↑'}`;
  const valueLabel = `거래대금${valueAsc ? '↓' : '↑'}`;

  const CATEGORIES: { key: ChartCategory; label: string }[] = [
    { key: 'volume', label: volumeLabel },
    { key: 'value', label: valueLabel },
    { key: 'surge', label: '급상승' },
    { key: 'drop', label: '급하락' },
    { key: 'new', label: '신규상장' },
    { key: 'dividend', label: '배당' },
  ];

  const list = useMemo(() => {
    const s = [...streamers];
    switch (category) {
      case 'volume': return volumeAsc
        ? s.sort((a, b) => a.totalVolume - b.totalVolume).slice(0, 30)
        : s.sort((a, b) => b.totalVolume - a.totalVolume).slice(0, 30);
      case 'value': return valueAsc
        ? s.sort((a, b) => a.price * a.totalVolume - b.price * b.totalVolume).slice(0, 30)
        : s.sort((a, b) => b.price * b.totalVolume - a.price * a.totalVolume).slice(0, 30);
      case 'surge': return s.filter(st => changePct(st.price, st.basePrice) > 0).sort((a, b) => changePct(b.price, b.basePrice) - changePct(a.price, a.basePrice)).slice(0, 30);
      case 'drop': return s.filter(st => changePct(st.price, st.basePrice) < 0).sort((a, b) => changePct(a.price, a.basePrice) - changePct(b.price, b.basePrice)).slice(0, 30);
      case 'new': {
        const today = new Date();
        const y = today.getFullYear();
        const m = today.getMonth();
        const d = today.getDate();
        return s.filter(st => {
          if (!st.listedAt) return false;
          const ld = new Date(st.listedAt);
          return ld.getFullYear() === y && ld.getMonth() === m && ld.getDate() === d;
        }).slice(0, 30);
      }
      case 'dividend': return s.filter(st => st.isLive).sort((a, b) => (b.dividendPool ?? 0) - (a.dividendPool ?? 0));
      default: return s.slice(0, 30);
    }
  }, [streamers, category, volumeAsc, valueAsc]);

  const colLabel = category === 'value' ? '거래대금' : category === 'dividend' ? '다음 배당' : '거래량';

  const dividendRemainingMs = (s: Stock): number => {
    if (!s.isLive || !s.liveStartedAt) return -1;
    void tick;
    const startMs = new Date(s.liveStartedAt).getTime();
    const nextMs = ((s.dividendAccumulationCount ?? 0) + 1) * 10 * 60 * 1000;
    return nextMs - (Date.now() - startMs);
  };

  const fmtRemaining = (ms: number): string => {
    if (ms <= 0) return '곧 지급';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const expectedPerShare = (s: Stock): string => {
    // 실제 배당 분모: 방송 시작 전 보유량 합계(preStreamFloat). 없으면 totalSupply로 fallback
    const divisor = (s.preStreamFloat && s.preStreamFloat > 0) ? s.preStreamFloat : (s.totalSupply ?? 0);
    if (divisor <= 0) return '계산 중';
    const hours = Math.max(1, s.baseBroadcastHours ?? 1);
    // price × 0.10 × hours / preStreamFloat × (1 - 배당세 0.20)
    const val = s.price * 0.10 * hours / divisor * 0.80;
    return val >= 1 ? `+${Math.floor(val)}코인` : `+${val.toFixed(4)}`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 카테고리 탭 */}
      <div className="flex gap-2 px-4 py-3 shrink-0 overflow-x-auto hide-scrollbar"
        style={{ borderBottom: '1px solid #222A3A' }}>
        {CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleCategoryClick(key)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
            style={{
              background: category === key ? '#00E676' : '#131924',
              color: category === key ? '#080A0F' : '#8491A5',
              border: '1px solid',
              borderColor: category === key ? '#00E676' : '#222A3A',
            }}>
            {label}
          </button>
        ))}
      </div>

      <>
        {/* 리스트 헤더 */}
        <div className="flex items-center px-4 py-2 shrink-0 text-xs font-bold uppercase tracking-wider"
          style={{ color: '#626B7A', borderBottom: '1px solid #1A2232', background: '#0E121A' }}>
          <span className="w-6 mr-3 text-center">#</span>
          <span className="flex-1">스트리머</span>
          <span className="w-24 text-right">현재가</span>
          {category !== 'dividend' && <span className="w-16 text-right">등락률</span>}
          <span className={`${category === 'dividend' ? 'w-28' : 'w-24'} text-right`}>{colLabel}</span>
        </div>

        {/* 리스트 */}
        <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar">
          {list.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#626B7A' }}>
              데이터가 없습니다
            </div>
          ) : list.map((s, i) => {
            const pct = changePct(s.price, s.basePrice);
            return (
              <div key={s.id} onClick={() => onSelect(s)}
                className="flex items-center px-4 py-3 cursor-pointer"
                style={{ borderBottom: '1px solid #1A2232' }}>
                <span className="w-6 mr-3 text-sm font-bold text-center shrink-0"
                  style={{ color: i < 3 ? '#BAC4D1' : '#626B7A' }}>
                  {i + 1}
                </span>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black overflow-hidden"
                    style={{ backgroundColor: s.profileImageUrl ? 'transparent' : avatarColor(s.name) }}>
                    {s.profileImageUrl ? (
                      <img src={s.profileImageUrl} alt={s.name} className="w-full h-full object-cover" />
                    ) : (
                      s.name.slice(0, 2)
                    )}
                  </div>
                  <p className="text-white text-sm font-bold truncate">{s.name}</p>
                </div>
                <div className="w-24 text-right shrink-0">
                  <p className="font-mono text-sm font-bold" style={{ color: priceColor(pct) }}>{fmt(s.price)}</p>
                </div>
                {category !== 'dividend' && (
                  <div className="w-16 text-right shrink-0">
                    <p className="text-xs font-bold" style={{ color: priceColor(pct) }}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                    </p>
                  </div>
                )}
                {category === 'dividend' ? (
                  <div className="w-28 text-right shrink-0">
                    <p className="text-xs font-bold font-mono" style={{ color: '#00E676' }}>
                      {fmtRemaining(dividendRemainingMs(s))}
                    </p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: '#8491A5' }}>
                      {(() => { const v = expectedPerShare(s); return v === '계산 중' ? v : `${v}/주`; })()}
                    </p>
                  </div>
                ) : (
                  <div className="w-24 text-right shrink-0">
                    <p className="text-xs font-mono" style={{ color: '#8491A5' }}>
                      {category === 'value' ? fmt(s.price * s.totalVolume) : fmtCompact(s.totalVolume)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    </div>
  );
};
