import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../contexts/ThemeContext';
import { apiFetch } from '../../lib/api';
import { betaTitleToneStyle, UserTitle } from '../rewards/betaRewards';

export const SettingsView = ({
  userId,
  portfolio,
  onBack,
}: {
  userId?: string;
  portfolio?: any;
  onBack: () => void;
}) => {
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const [isRankingNicknamePublic, setIsRankingNicknamePublic] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [selectedTitleId, setSelectedTitleId] = useState<string>('');
  const [titleSaving, setTitleSaving] = useState(false);
  const ownedTitles: UserTitle[] = Array.isArray(portfolio?.titles) ? portfolio.titles : [];

  useEffect(() => {
    setIsRankingNicknamePublic(Boolean(portfolio?.rankingNicknamePublic));
  }, [portfolio?.rankingNicknamePublic]);

  useEffect(() => {
    if (!userId) {
      setSelectedTitleId('');
      return;
    }
    setSelectedTitleId(portfolio?.selectedTitleId ? String(portfolio.selectedTitleId) : '');
  }, [userId, portfolio?.selectedTitleId]);

  const toggleRankingNicknamePublic = async () => {
    if (!userId || privacySaving) return;
    const next = !isRankingNicknamePublic;
    setIsRankingNicknamePublic(next);
    setPrivacySaving(true);
    try {
      const res = await apiFetch('/api/profile/ranking-nickname-public', {
        method: 'POST',
        body: JSON.stringify({ isPublic: next }),
      });
      if (!res.ok) {
        throw new Error('랭킹 닉네임 설정 변경 실패');
      }
      queryClient.setQueryData(['portfolio', userId], (old: any) => (
        old ? { ...old, rankingNicknamePublic: next } : old
      ));
      queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
      queryClient.invalidateQueries({ queryKey: ['rankings'] });
    } catch {
      setIsRankingNicknamePublic(!next);
    } finally {
      setPrivacySaving(false);
    }
  };

  const selectDisplayTitle = async (titleId: string) => {
    if (!userId || titleSaving) return;
    const previous = selectedTitleId;
    setSelectedTitleId(titleId);
    setTitleSaving(true);
    try {
      const res = await apiFetch('/api/inventory/selected-title', {
        method: 'POST',
        body: JSON.stringify({ titleId: titleId || null }),
      });
      if (!res.ok) {
        throw new Error('대표 칭호 설정 실패');
      }
      const data = await res.json();
      const savedTitleId = data.selectedTitleId ? String(data.selectedTitleId) : '';
      setSelectedTitleId(savedTitleId);
      queryClient.setQueryData(['portfolio', userId], (old: any) => (
        old ? { ...old, selectedTitleId: savedTitleId || null } : old
      ));
      queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
      queryClient.invalidateQueries({ queryKey: ['rankings'] });
    } catch {
      setSelectedTitleId(previous);
    } finally {
      setTitleSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar touch-pan-y">
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="md:hidden w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors hover:opacity-80 active:opacity-60"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
          aria-label="뒤로 가기"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0">
          <h2 className="text-xl font-black text-white">설정</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            앱 표시와 사용 환경을 조정합니다
          </p>
        </div>
      </div>

      <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-secondary)' }}>화면</h3>
        <ThemeToggleRow theme={theme} onToggle={toggleTheme} />
      </div>

      <div className="rounded-xl border p-4 mt-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-secondary)' }}>개인정보</h3>
        <PrivacyToggleRow
          isPublic={isRankingNicknamePublic}
          disabled={!userId || privacySaving}
          onToggle={toggleRankingNicknamePublic}
        />
      </div>

      <div className="rounded-xl border p-4 mt-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>대표 칭호</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
              프로필과 랭킹에 표시할 칭호를 선택합니다
            </p>
          </div>
          <span className="text-xs font-bold px-2 py-1 rounded-md border shrink-0" style={betaTitleToneStyle(selectedTitleId ? 'gold' : 'gray')}>
            {selectedTitleId ? '표시 중' : '숨김'}
          </span>
        </div>
        <div className="space-y-2">
          <TitleSelectRow
            title={null}
            selected={!selectedTitleId}
            disabled={!userId || titleSaving}
            onSelect={() => selectDisplayTitle('')}
          />
          {ownedTitles.length === 0 && (
            <p className="text-xs px-1 py-2" style={{ color: 'var(--text-dim)' }}>
              아직 보유한 칭호가 없습니다.
            </p>
          )}
          {ownedTitles.map(title => (
            <TitleSelectRow
              key={title.id}
              title={title}
              selected={selectedTitleId === String(title.id)}
              disabled={!userId || titleSaving}
              onSelect={() => selectDisplayTitle(String(title.id))}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

function TitleSelectRow({
  title,
  selected,
  disabled,
  onSelect,
}: {
  title: UserTitle | null;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="w-full rounded-lg border px-3 py-2 flex items-center justify-between gap-3 text-left disabled:opacity-50"
      style={{
        background: selected ? 'var(--accent-soft)' : 'var(--bg-sidebar)',
        borderColor: selected ? 'var(--accent)' : 'var(--border-primary)',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {title ? (
          <span className="text-[11px] font-black px-2 py-1 rounded-md border shrink-0 max-w-[108px] text-center leading-tight"
            style={betaTitleToneStyle(title.tone)}>
            {title.label}
          </span>
        ) : (
          <span className="text-[11px] font-black px-2 py-1 rounded-md border shrink-0"
            style={betaTitleToneStyle('gray')}>
            칭호 없음
          </span>
        )}
        <p className="text-xs truncate" style={{ color: 'var(--text-dim)' }}>
          {title?.description || '랭킹과 프로필에서 칭호를 숨깁니다'}
        </p>
      </div>
      <span className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0"
        style={{ borderColor: selected ? 'var(--accent)' : 'var(--border-primary)', color: selected ? 'var(--accent)' : 'transparent' }}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    </button>
  );
}

function ThemeToggleRow({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  const isDark = theme === 'dark';
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 min-w-0">
        {isDark ? (
          <svg className="w-4 h-4 shrink-0" style={{ color: '#BAC4D1' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 shrink-0" style={{ color: '#F59E0B' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M18.364 18.364l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">
            {isDark ? '다크 모드' : '라이트 모드'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            {isDark ? '어두운 화면' : '밝은 화면'}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="relative shrink-0 transition-all duration-300"
        style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          background: isDark ? '#1A2232' : 'var(--accent)',
          border: `2px solid ${isDark ? 'var(--border-primary)' : 'var(--accent)'}`,
        }}
        aria-label="테마 변경"
        aria-pressed={!isDark}
      >
        <span
          className="absolute top-0.5 transition-all duration-300"
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: isDark ? '#626B7A' : '#FFFFFF',
            left: isDark ? 2 : 20,
          }}
        />
      </button>
    </div>
  );
}

function PrivacyToggleRow({ isPublic, disabled, onToggle }: { isPublic: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <svg className="w-4 h-4 shrink-0" style={{ color: isPublic ? 'var(--accent)' : '#BAC4D1' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isPublic ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.973 9.973 0 012.201-3.592M6.223 6.223A9.956 9.956 0 0112 5c4.478 0 8.268 2.943 9.542 7a9.96 9.96 0 01-4.132 5.168M3 3l18 18M9.88 9.88A3 3 0 0012 15a3 3 0 002.12-5.12" />
          )}
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">랭킹 닉네임</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            {isPublic ? '공개' : '비공개'}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="relative shrink-0 transition-all duration-300"
        style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          background: isPublic ? 'var(--accent)' : '#1A2232',
          border: `2px solid ${isPublic ? 'var(--accent)' : 'var(--border-primary)'}`,
        }}
        aria-label="랭킹 닉네임 공개 설정"
        aria-pressed={isPublic}
      >
        <span
          className="absolute top-0.5 transition-all duration-300"
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: isPublic ? '#FFFFFF' : '#626B7A',
            left: isPublic ? 20 : 2,
          }}
        />
      </button>
    </div>
  );
}
