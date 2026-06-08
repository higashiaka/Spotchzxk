import { AppTab } from '../../types';

/** Bottom navigation item definition.
 *  tab: tab identifier, label: display text, path: SVG icon path data */
const NAV_ITEMS: { tab: AppTab; label: string; path: string }[] = [
  { tab: 'home',    label: '홈',    path: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { tab: 'prices',  label: '시세',  path: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z' },
  { tab: 'chart',   label: '차트',  path: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { tab: 'rankings', label: '랭킹', path: 'M5 3h14M8 21h8M12 17V3M7 7H4a1 1 0 00-1 1v2a4 4 0 004 4M17 7h3a1 1 0 011 1v2a4 4 0 01-4 4' },
  { tab: 'shop',    label: '상점',  path: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
  { tab: 'profile', label: '내 정보', path: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
];

/** Mobile bottom fixed navigation bar (visible only below md breakpoint).
 *  Tab switcher with blur backdrop, icons, and labels */
export const MobileNavBar = ({
  activeTab,
  onNavigate,
}: {
  /** Currently active tab */
  activeTab: AppTab;
  /** Tab switch handler */
  onNavigate: (tab: AppTab) => void;
}) => {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 flex z-50 surface-nav border-t border-primary-token">
      {NAV_ITEMS.map(({ tab, label, path }) => {
        const active = activeTab === tab;
        return (
          <button key={tab} type="button" onClick={() => onNavigate(tab)}
            className={`flex-1 py-3 flex flex-col items-center gap-1 transition-colors ${active ? 'mobile-nav-active' : 'mobile-nav-inactive'}`}
            // Active tab is green, inactive is dimmed
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={path} />
            </svg>
            <span className="text-[10px] font-bold">{label}</span>
          </button>
        );
      })}
    </div>
  );
};
