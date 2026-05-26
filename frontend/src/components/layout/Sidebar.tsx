// 데스크톱 사이드바: 프로필, 자산 요약, 메뉴 이동, 빠른 종목 목록을 제공합니다.
import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { AppTab } from '../../types';
import { ProfileView } from '../profile/ProfileView';

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
  activeTab: AppTab;
  user: User | null;
  portfolio: any;
  history: any[];
  streamers: Stock[];
  totalAssets: number;
  isResetting: boolean;
  remainingResets: number;
  onLoginGoogle: () => void;
  onLoginGuest: () => void;
  onLogout: () => void;
  onReset: () => void;
  onLinkGoogle: () => void;
  onSelect: (s: Stock) => void;
  onNavigate: (tab: AppTab) => void;
}) => {
  return (
    <div
      className={`${activeTab === 'profile' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[300px] md:shrink-0 h-full overflow-hidden`}
      style={{ background: '#0E121A', borderRight: '1px solid #222A3A' }}
    >
      {/* 로고 */}
      <div className="p-5" style={{ borderBottom: '1px solid #222A3A' }}>
        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500 tracking-tighter">
          Spotchzxk
        </h1>
        <p className="text-xs font-bold uppercase tracking-widest mt-1" style={{ color: '#626B7A' }}>
          Global Streamer Exchange
        </p>
      </div>

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
    </div>
  );
};
