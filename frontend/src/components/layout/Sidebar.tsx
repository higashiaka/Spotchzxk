import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { AppTab } from '../../types';
import { ProfileView } from '../profile/ProfileView';

/** Desktop left sidebar (always visible on md+, shown only on profile tab on mobile).
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
  isAdmin,
  onLoginGoogle,
  onLoginNaver,
  onLoginGuest,
  onLogout,
  onReset,
  onLinkGoogle,
  onLinkNaver,
  naverLinked,
  onSelect,
  onNavigate,
  collapsed = false,
}: {
  /** Current active tab (used to control mobile visibility) */
  activeTab: AppTab;
  /** Authenticated Firebase user, null if not logged in */
  user: User | null;
  /** Portfolio data */
  portfolio: any;
  /** Order and transaction history list */
  history: any[];
  /** Full list of stocks */
  streamers: Stock[];
  /** Total assets (cash + stock market value) */
  totalAssets: number | bigint;
  /** Whether portfolio reset is in progress */
  isResetting: boolean;
  /** Remaining portfolio reset count for today */
  remainingResets: number;
  /** Whether the current user has admin authority */
  isAdmin: boolean;
  /** Google login handler */
  onLoginGoogle: () => void;
  /** Naver login handler */
  onLoginNaver: () => void;
  /** Guest login handler */
  onLoginGuest: () => void;
  /** Logout handler */
  onLogout: () => void;
  /** Portfolio reset handler */
  onReset: () => void;
  /** Google account link handler */
  onLinkGoogle: () => void;
  /** Naver account link handler */
  onLinkNaver: () => void;
  /** Whether current user already has Naver linked */
  naverLinked: boolean;
  /** Stock selection handler */
  onSelect: (s: Stock) => void;
  /** Tab navigation handler */
  onNavigate: (tab: AppTab) => void;
  /** Desktop collapsed state */
  collapsed?: boolean;
}) => {
  return (
    <div
      className={`${activeTab === 'profile' ? 'flex' : 'hidden'} md:flex flex-col w-full ${collapsed ? 'md:w-16' : 'md:w-[300px]'} md:shrink-0 h-full overflow-hidden surface-sidebar border-r border-primary-token transition-[width] duration-200`}
    >
      {collapsed ? (
        <div className="hidden md:flex h-full flex-col items-center gap-2 px-2 py-3">
          <button
            type="button"
            onClick={() => onNavigate('guide')}
            className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors hover:opacity-80 active:opacity-60"
            style={{
              background: activeTab === 'guide' ? 'var(--accent-soft)' : 'var(--bg-card)',
              borderColor: activeTab === 'guide' ? 'var(--accent-border)' : 'var(--border-primary)',
              color: activeTab === 'guide' ? 'var(--accent)' : 'var(--text-dim)',
            }}
            aria-label="Guide"
            title="Guide"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors hover:opacity-80 active:opacity-60"
            style={{
              background: activeTab === 'settings' ? 'var(--accent-soft)' : 'var(--bg-card)',
              borderColor: activeTab === 'settings' ? 'var(--accent-border)' : 'var(--border-primary)',
              color: activeTab === 'settings' ? 'var(--accent)' : 'var(--text-dim)',
            }}
            aria-label="Settings"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.607 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      ) : (
        <>
          {/* Logo header */}
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
                  aria-label="Guide"
                  title="Guide"
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
                  aria-label="Settings"
                  title="Settings"
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

          {/* ProfileView: profile, assets, holdings, settings */}
          <div className="flex-1 overflow-hidden">
            <ProfileView
              user={user}
              portfolio={portfolio}
              history={history}
              streamers={streamers}
              totalAssets={totalAssets}
              isAdmin={isAdmin}
              onLoginGoogle={onLoginGoogle}
              onLoginNaver={onLoginNaver}
              onLoginGuest={onLoginGuest}
              onLogout={onLogout}
              onReset={onReset}
              onLinkGoogle={onLinkGoogle}
              onLinkNaver={onLinkNaver}
              naverLinked={naverLinked}
              isResetting={isResetting}
              remainingResets={remainingResets}
              onSelect={onSelect}
              onNavigate={onNavigate}
            />
          </div>
        </>
      )}
    </div>
  );
};
