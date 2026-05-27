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
        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500 tracking-tighter">
          Spotchzxk
        </h1>
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
    </div>
  );
};
