import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { subscribeStomp, registerOnConnect } from '../../lib/stompClient';
import { avatarColor, fmtKorean, priceColor } from '../../utils';
import { betaRewardTiers, betaTitleToneStyle } from '../rewards/betaRewards';

type RankingType = 'realized' | 'dividend' | 'beta';

interface UserRankingEntry {
  rank: number;
  displayName: string;
  profileImageUrl?: string;
  value: number;
  realizedProfit?: number;
  dividendTotal?: number;
  donationTotal?: number;
  titleLabel?: string;
  stockName?: string;
}

export function UserRankingView() {
  const [rankingType, setRankingType] = useState<RankingType>('realized');
  const queryClient = useQueryClient();

  const {
    data: rankings = [],
    isLoading,
  } = useQuery({
    queryKey: ['rankings', rankingType],
    queryFn: async (): Promise<UserRankingEntry[]> => {
      if (rankingType === 'beta') return [];
      const res = await apiFetch(`/api/rankings?type=${rankingType}`);
      if (!res.ok) throw new Error('랭킹 조회 실패');
      return res.json();
    },
    enabled: rankingType !== 'beta',
    refetchInterval: 60_000,
  });

  const valueLabel = rankingType === 'dividend'
    ? '배당수익'
    : rankingType === 'beta'
        ? '선정 기준'
        : '실현손익';
  const categories: { key: RankingType; label: string }[] = [
    { key: 'realized', label: '실현손익' },
    { key: 'dividend', label: '배당수익' },
    { key: 'beta', label: '베타명예' },
  ];

  useEffect(() => {
    const sub = subscribeStomp('/topic/rankings-reset', () => {
      queryClient.invalidateQueries({ queryKey: ['rankings'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    });
    return () => sub.unsubscribe();
  }, [queryClient]);

  // Re-fetch rankings on STOMP reconnect to pick up resets missed while disconnected
  useEffect(() => {
    return registerOnConnect(() => {
      queryClient.invalidateQueries({ queryKey: ['rankings'] });
    });
  }, [queryClient]);

  return (
    <div className="h-full flex flex-col overflow-hidden w-full max-w-5xl mx-auto">
      <div className="px-4 py-4 md:px-8 md:py-7 shrink-0">
        <h2 className="text-lg md:text-3xl font-black text-white">유저 랭킹</h2>
        <p className="text-xs md:text-base mt-1 md:mt-2" style={{ color: 'var(--text-dim)' }}>
          {rankingType === 'beta'
              ? '베타 보상 칭호 선정 기준'
              : `${valueLabel} 상위 50명`}
        </p>
      </div>

      <div
        className="grid grid-cols-3 gap-2 px-4 py-3 md:px-8 md:py-4 shrink-0"
        style={{ borderTop: '1px solid var(--border-primary)', borderBottom: '1px solid var(--border-primary)' }}
      >
        {categories.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setRankingType(key)}
            className="h-10 md:h-14 rounded-lg text-[11px] sm:text-xs md:text-base font-black transition-colors whitespace-nowrap"
            style={{
              background: rankingType === key ? 'var(--accent)' : 'var(--bg-card-secondary)',
              color: rankingType === key ? 'var(--accent-foreground)' : 'var(--text-muted)',
              border: '1px solid',
              borderColor: rankingType === key ? 'var(--accent)' : 'var(--border-primary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {rankingType !== 'beta' && (
        <div
          className="flex items-center px-4 py-2 md:px-8 md:py-3 shrink-0 text-xs md:text-sm font-bold uppercase tracking-wider"
          style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border-card)', background: 'var(--bg-sidebar)' }}
        >
          <span className="w-6 md:w-10 mr-3 md:mr-5 text-center">#</span>
          <span className="flex-1">유저</span>
          <span className="hidden md:block w-36 text-left">칭호</span>
          <span className="w-32 md:w-48 text-right">{valueLabel}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar touch-pan-y">
        {rankingType === 'beta' ? (
          <div className="p-4 md:p-8 space-y-3">
            {betaRewardTiers.map(tier => (
              <div key={tier.id} className="rounded-lg border p-4"
                style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black px-2 py-1 rounded-md border" style={betaTitleToneStyle(tier.tone)}>
                    {tier.label}
                  </span>
                  <span className="text-xs font-bold" style={{ color: 'var(--text-dim)' }}>
                    {tier.status === 'pending' ? '참여 보상' : '최종 랭킹'}
                  </span>
                </div>
                <p className="text-sm mt-3 text-white font-bold">{tier.description}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                  {tier.id === 'beta-top-donation'
                    ? '종목별 후원 합산이 아니라, 각 종목 팬 랭킹에서 상위 유저에게 “OO 스트리머의 팬” 칭호를 지급합니다.'
                    : '정식 전환 스냅샷 기준으로 대상자를 확정합니다.'}
                </p>
              </div>
            ))}
          </div>
        ) : isLoading ? (
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
              className="flex items-center px-4 py-3 md:px-8 md:py-5"
              style={{ borderBottom: '1px solid var(--border-card)' }}
            >
              <span
                className="w-6 md:w-10 mr-3 md:mr-5 text-sm md:text-lg font-bold text-center shrink-0"
                style={{ color: entry.rank <= 3 ? 'var(--text-secondary)' : 'var(--text-dim)' }}
              >
                {entry.rank}
              </span>
              <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
                <div
                  className="w-8 h-8 md:w-12 md:h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0 text-white text-xs md:text-base font-black"
                  style={{ backgroundColor: entry.profileImageUrl ? 'transparent' : avatarColor(entry.displayName) }}
                >
                  {entry.profileImageUrl ? (
                    <img src={entry.profileImageUrl} alt={entry.displayName} className="w-full h-full object-cover" />
                  ) : (
                    entry.displayName.slice(0, 2)
                  )}
                </div>
                <p className="text-white text-sm md:text-lg font-bold truncate">{entry.displayName}</p>
              </div>
              <div className="hidden md:block w-36 text-left shrink-0">
                {entry.titleLabel && (
                  <span className="text-xs font-bold px-2 py-1 rounded-md border" style={betaTitleToneStyle('gold')}>
                    {entry.titleLabel}
                  </span>
                )}
              </div>
              <div className="w-32 md:w-48 text-right shrink-0">
                <p
                  className="text-sm md:text-lg font-bold font-mono"
                  style={{ color: priceColor(entry.value) }}
                >
                  {`${entry.value >= 0 ? '+' : ''}${fmtKorean(Math.abs(entry.value))}`}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
