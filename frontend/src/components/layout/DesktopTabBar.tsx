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
    { tab: 'shop' as const, label: '상점' },
  ];

  return (
    <div
      className="hidden md:flex items-center px-5 shrink-0"
      style={{ background: '#0E121A', borderBottom: '1px solid #222A3A' }}
    >
      <div className="flex items-center">
        {tabs.map(({ tab, label }) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onNavigate(tab)}
              className="py-4 px-5 text-sm font-bold border-b-2 transition-colors"
              style={{
                borderBottomColor: active ? '#00E676' : 'transparent',
                color: active ? '#00E676' : '#626B7A',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
