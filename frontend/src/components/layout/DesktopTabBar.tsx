import { AppTab } from '../../types';

/** 데스크톱 상단 탭 컴포넌트 (md 이상에서만 표시).
 *  사이드바 오른쪽 콘텐츠 영역의 주요 화면을 전환
 *
 *  Desktop top tab bar (visible only on md and above).
 *  Switches between main content views in the right panel */
export const DesktopTabBar = ({
  activeTab,
  onNavigate,
}: {
  /** 현재 활성 탭 (profile 탭은 사이드바에서 처리하므로 제외)
   *  Currently active tab (profile excluded as it's handled by the sidebar) */
  activeTab: Exclude<AppTab, 'profile'>;
  /** 탭 전환 핸들러 / Tab switch handler */
  onNavigate: (tab: AppTab) => void;
}) => {
  /** 표시할 탭 정의 목록 / Tab definitions to display */
  const tabs = [
    { tab: 'home' as const, label: '홈' },
    { tab: 'prices' as const, label: '시세' },
    { tab: 'chart' as const, label: '차트' },
    { tab: 'shop' as const, label: '상점' },
  ];

  return (
    <div className="hidden md:flex items-center px-5 shrink-0"
      style={{ background: '#0E121A', borderBottom: '1px solid #222A3A' }}>
      {tabs.map(({ tab, label }) => {
        const active = activeTab === tab;
        return (
          <button key={tab} type="button" onClick={() => onNavigate(tab)}
            className="py-4 px-5 text-sm font-bold border-b-2 transition-colors"
            style={{
              // 활성 탭은 녹색 언더라인, 비활성은 투명 / Active tab has green underline, inactive is transparent
              borderBottomColor: active ? '#00E676' : 'transparent',
              color: active ? '#00E676' : '#626B7A',
            }}>
            {label}
          </button>
        );
      })}
    </div>
  );
};
