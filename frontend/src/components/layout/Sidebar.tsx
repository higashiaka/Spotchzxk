import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { AppTab } from '../../types';
import { ProfileView } from '../profile/ProfileView';

/** 데스크톱 좌측 사이드바 컴포넌트 (md 이상에서 항상 표시, 모바일에서는 profile 탭 시에만 표시).
 *  상단 로고 + ProfileView(프로필·자산·설정)로 구성
 *
 *  Desktop left sidebar (always visible on md+, shown only on profile tab on mobile).
 *  Composed of the top logo header and ProfileView (profile, assets, settings) */
export const Sidebar = ({
  activeTab,
  user,
  portfolio,
  history,
  streamers,
  totalAssets,
  isResetting,
  remainingResets,
  onLoginGoogle,
  onLoginGuest,
  onLogout,
  onReset,
  onLinkGoogle,
  onSelect,
  onNavigate,
}: {
  /** 현재 활성 탭 (모바일 표시 여부 결정에 사용) / Current active tab (used to control mobile visibility) */
  activeTab: AppTab;
  /** Firebase 인증 사용자 (미로그인 시 null) / Authenticated Firebase user, null if not logged in */
  user: User | null;
  /** 포트폴리오 데이터 / Portfolio data */
  portfolio: any;
  /** 주문/거래 내역 목록 / Order and transaction history list */
  history: any[];
  /** 전체 종목 목록 / Full list of stocks */
  streamers: Stock[];
  /** 총 자산 (현금 + 주식 평가액) / Total assets (cash + stock market value) */
  totalAssets: number;
  /** 포트폴리오 초기화 진행 중 여부 / Whether portfolio reset is in progress */
  isResetting: boolean;
  /** 오늘 남은 초기화 횟수 / Remaining portfolio reset count for today */
  remainingResets: number;
  /** Google 로그인 핸들러 / Google login handler */
  onLoginGoogle: () => void;
  /** 게스트 로그인 핸들러 / Guest login handler */
  onLoginGuest: () => void;
  /** 로그아웃 핸들러 / Logout handler */
  onLogout: () => void;
  /** 포트폴리오 초기화 핸들러 / Portfolio reset handler */
  onReset: () => void;
  /** Google 계정 연동 핸들러 / Google account link handler */
  onLinkGoogle: () => void;
  /** 종목 선택 핸들러 / Stock selection handler */
  onSelect: (s: Stock) => void;
  /** 탭 전환 핸들러 / Tab navigation handler */
  onNavigate: (tab: AppTab) => void;
}) => {
  return (
    <div
      className={`${activeTab === 'profile' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[300px] md:shrink-0 h-full overflow-hidden surface-sidebar border-r border-primary-token`}
    >
      {/* 로고 헤더 / Logo header */}
      <div className="p-5 border-bottom-primary">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500 tracking-tighter">
            Spotchzxk
          </h1>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('guide')}
              className="w-9 h-9 md:w-10 md:h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors hover:opacity-80 active:opacity-60"
              style={{
                background: activeTab === 'guide' ? 'var(--accent-soft)' : 'var(--bg-card)',
                borderColor: activeTab === 'guide' ? 'var(--accent-border)' : 'var(--border-primary)',
                color: activeTab === 'guide' ? 'var(--accent)' : 'var(--text-dim)',
              }}
              aria-label="가이드"
              title="가이드"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="w-9 h-9 md:w-10 md:h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors hover:opacity-80 active:opacity-60"
              style={{
                background: activeTab === 'settings' ? 'var(--accent-soft)' : 'var(--bg-card)',
                borderColor: activeTab === 'settings' ? 'var(--accent-border)' : 'var(--border-primary)',
                color: activeTab === 'settings' ? 'var(--accent)' : 'var(--text-dim)',
              }}
              aria-label="설정"
              title="설정"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.607 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
        <p className="text-xs font-bold uppercase tracking-widest mt-1 text-dim-token">
          Global Streamer Exchange
        </p>
      </div>

      {/* ProfileView: 프로필·자산·보유 종목·설정 영역 / ProfileView: profile, assets, holdings, settings */}
      <div className="flex-1 overflow-hidden">
        <ProfileView
          user={user}
          portfolio={portfolio}
          history={history}
          streamers={streamers}
          totalAssets={totalAssets}
          isAdmin={false}
          onLoginGoogle={onLoginGoogle}
          onLoginGuest={onLoginGuest}
          onLogout={onLogout}
          onReset={onReset}
          onLinkGoogle={onLinkGoogle}
          isResetting={isResetting}
          remainingResets={remainingResets}
          onSelect={onSelect}
          onNavigate={onNavigate}
        />
      </div>

      {/* 하단 고정 영역: 저빈도 참조 링크 / Sticky footer: low-frequency reference links */}
      <div className="shrink-0 px-5 py-3 border-t" style={{ borderColor: 'var(--border-primary)' }}>
        <button
          type="button"
          onClick={() => onNavigate('announcements')}
          className="text-xs font-bold transition-colors hover:opacity-80 active:opacity-60"
          style={{ color: activeTab === 'announcements' ? 'var(--accent)' : 'var(--text-muted)' }}
        >
          지난 공지
        </button>
      </div>
    </div>
  );
};
