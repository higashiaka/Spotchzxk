import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeContext';
import { apiFetch } from '@/lib/api';

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

  useEffect(() => {
    setIsRankingNicknamePublic(Boolean(portfolio?.rankingNicknamePublic));
  }, [portfolio?.rankingNicknamePublic]);

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
    </div>
  );
};

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
