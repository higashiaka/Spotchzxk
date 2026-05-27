import { useTheme } from '../../contexts/ThemeContext';

export const SettingsView = ({
  onBack,
}: {
  onBack: () => void;
}) => {
  const { theme, toggleTheme } = useTheme();

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
          background: isDark ? '#1A2232' : '#00E676',
          border: `2px solid ${isDark ? '#222A3A' : '#00C864'}`,
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
