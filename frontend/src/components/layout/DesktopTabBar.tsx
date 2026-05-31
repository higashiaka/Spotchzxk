import { AppTab } from '../../types';

export const DesktopTabBar = ({
  activeTab,
  onNavigate,
}: {
  activeTab: Exclude<AppTab, 'profile'>;
  onNavigate: (tab: AppTab) => void;
}) => {
  const tabs = [
    { tab: 'home' as const, label: '홈' },
    { tab: 'prices' as const, label: '시세' },
    { tab: 'chart' as const, label: '차트' },
    { tab: 'rankings' as const, label: '랭킹' },
    { tab: 'shop' as const, label: '상점' },
  ];

  return (
    <div className="hidden md:flex items-center px-6 shrink-0 surface-sidebar border-bottom-primary">
      <div className="flex items-center">
        {tabs.map(({ tab, label }) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onNavigate(tab)}
              className={`py-5 px-6 text-base font-bold border-b-2 transition-colors ${active ? 'nav-tab-active' : 'nav-tab-inactive'}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
