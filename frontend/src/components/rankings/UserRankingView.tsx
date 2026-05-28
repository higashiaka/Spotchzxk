import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { avatarColor, fmt, priceColor } from '../../utils';

type RankingType = 'realized' | 'dividend';

interface UserRankingEntry {
  rank: number;
  displayName: string;
  value: number;
  realizedProfit?: number;
  dividendTotal?: number;
}

export function UserRankingView() {
  const [rankingType, setRankingType] = useState<RankingType>('realized');
  const {
    data: rankings = [],
    isLoading,
  } = useQuery({
    queryKey: ['rankings', rankingType],
    queryFn: async (): Promise<UserRankingEntry[]> => {
      const res = await apiFetch(`/api/rankings?type=${rankingType}`);
      if (!res.ok) throw new Error('랭킹 조회 실패');
      return res.json();
    },
  });

  const valueLabel = rankingType === 'dividend' ? '배당수익' : '실현손익';
  const categories: { key: RankingType; label: string }[] = [
    { key: 'realized', label: '실현손익' },
    { key: 'dividend', label: '배당수익' },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-4 shrink-0">
        <h2 className="text-lg font-black text-white">유저 랭킹</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
          {valueLabel} 상위 50명
        </p>
      </div>

      <div
        className="flex gap-2 px-4 py-3 shrink-0 overflow-x-auto hide-scrollbar"
        style={{ borderTop: '1px solid #222A3A', borderBottom: '1px solid #222A3A' }}
      >
        {categories.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setRankingType(key)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
            style={{
              background: rankingType === key ? '#00E676' : 'var(--bg-card-secondary)',
              color: rankingType === key ? 'var(--accent-foreground)' : 'var(--text-muted)',
              border: '1px solid',
              borderColor: rankingType === key ? '#00E676' : 'var(--border-primary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="flex items-center px-4 py-2 shrink-0 text-xs font-bold uppercase tracking-wider"
        style={{ color: 'var(--text-dim)', borderBottom: '1px solid #1A2232', background: 'var(--bg-sidebar)' }}
      >
        <span className="w-6 mr-3 text-center">#</span>
        <span className="flex-1">유저</span>
        <span className="w-32 text-right">{valueLabel}</span>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar touch-pan-y">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--text-dim)' }}>
            불러오는 중...
          </div>
        ) : rankings.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--text-dim)' }}>
            랭킹 데이터가 없습니다
          </div>
        ) : (
          rankings.map(entry => (
            <div
              key={`${rankingType}-${entry.rank}-${entry.displayName}`}
              className="flex items-center px-4 py-3"
              style={{ borderBottom: '1px solid #1A2232' }}
            >
              <span
                className="w-6 mr-3 text-sm font-bold text-center shrink-0"
                style={{ color: entry.rank <= 3 ? 'var(--text-secondary)' : 'var(--text-dim)' }}
              >
                {entry.rank}
              </span>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black"
                  style={{ backgroundColor: avatarColor(entry.displayName) }}
                >
                  {entry.displayName.slice(0, 2)}
                </div>
                <p className="text-white text-sm font-bold truncate">{entry.displayName}</p>
              </div>
              <div className="w-32 text-right shrink-0">
                <p
                  className="text-sm font-bold font-mono"
                  style={{ color: priceColor(entry.value) }}
                >
                  {entry.value >= 0 ? '+' : ''}{fmt(entry.value)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
