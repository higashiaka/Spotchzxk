import { useState, useMemo, useEffect, lazy, Suspense, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStocks } from './hooks/useStocks';
import { usePortfolio } from './hooks/usePortfolio';
import { useTransactionHistory } from './hooks/useTransactionHistory';
import { useResetPortfolio } from './hooks/useResetPortfolio';
import { useAuth } from './hooks/useAuth';
import { useLiveTrades } from './hooks/useLiveTrades';
import { useOnlineCount } from './hooks/useOnlineCount';
import { useAppNavigation } from './hooks/useAppNavigation';
import { useSwipeGesture, SWIPE_TABS } from './hooks/useSwipeGesture';
import { subscribeStomp } from './lib/stompClient';
import { AppTab } from './types';

import { Sidebar } from './components/layout/Sidebar';
import { DesktopTabBar } from './components/layout/DesktopTabBar';
import { MobileNavBar } from './components/layout/MobileNavBar';
import { GuestLimitModal } from './components/common/GuestLimitModal';
import { SuspendedAccountModal } from './components/common/SuspendedAccountModal';
import AnnouncementPopup from './components/AnnouncementPopup';

const HomeView = lazy(() => import('./components/home/HomeView').then(m => ({ default: m.HomeView })));
const PricesView = lazy(() => import('./components/prices/PricesView').then(m => ({ default: m.PricesView })));
const ChartView = lazy(() => import('./components/rankings/ChartView').then(m => ({ default: m.ChartView })));
const UserRankingView = lazy(() => import('./components/rankings/UserRankingView').then(m => ({ default: m.UserRankingView })));
const OrderView = lazy(() => import('./components/order/OrderView').then(m => ({ default: m.OrderView })));
const ShopView = lazy(() => import('./components/shop/ShopView').then(m => ({ default: m.ShopView })));
const HoldingsView = lazy(() => import('./components/holdings/HoldingsView').then(m => ({ default: m.HoldingsView })));
const SettingsView = lazy(() => import('./components/settings/SettingsView').then(m => ({ default: m.SettingsView })));
const GuideView = lazy(() => import('./components/guide/GuideView').then(m => ({ default: m.GuideView })));
const AnnouncementArchiveView = lazy(() => import('./components/announcements/AnnouncementArchiveView').then(m => ({ default: m.AnnouncementArchiveView })));


const TabFallback = () => (
  <div className="h-full flex items-center justify-center text-dim-token font-mono text-sm">
    로딩 중...
  </div>
);

function App() {
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => window.matchMedia('(min-width: 768px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktopLayout(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const {
    user, authChecking,
    guestLimitNotice, guestLimitNow,
    suspensionNotice,
    handleGoogleLogin, handleGuestLogin, handleGuestLimitGoogleLogin,
    handleLogout, handleLinkGoogle,
  } = useAuth();

  const { stocks: streamers, stocksLoading } = useStocks();
  const queryClient = useQueryClient();

  const nav = useAppNavigation(streamers, isDesktopLayout);
  const {
    activeTab, selectedStreamer, initialOrderType, recentlyViewedIds, mobileRouteMotion,
    handleNavigate, handleSwipeToTab, handleSelectStreamer, handleOrderFromDetail,
    handleSelectStreamerForPrices, handleSelectStreamerForOrder,
    handleBackFromPrices, handleBackFromOrder, handleBackFromHoldings,
    handleBackFromSettings, handleBackFromGuide, handleBackFromAnnouncements,
    handleRemoveRecent,
  } = nav;

  // Tabs that have been visited at least once — keeps them mounted for instant swipe-back
  const [visitedTabs, setVisitedTabs] = useState<Set<AppTab>>(() => new Set([activeTab]));

  useEffect(() => {
    setVisitedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  // Pre-mount adjacent swipe tabs so the destination is ready before the gesture completes
  const preloadAdjacentTabs = useCallback((currentTab: AppTab) => {
    const idx = SWIPE_TABS.indexOf(currentTab);
    if (idx === -1) return;
    setVisitedTabs(prev => {
      const next = new Set(prev);
      if (idx > 0) next.add(SWIPE_TABS[idx - 1]);
      if (idx < SWIPE_TABS.length - 1) next.add(SWIPE_TABS[idx + 1]);
      return next;
    });
  }, []);

  const streamerNameById = useMemo(
    () => new Map(streamers.map(s => [s.id, s.name])),
    [streamers],
  );

  const liveTrades = useLiveTrades(streamerNameById);
  const onlineCount = useOnlineCount();

  const { data: portfolio } = usePortfolio(user?.uid);
  const { data: history } = useTransactionHistory(user?.uid);
  const resetMutation = useResetPortfolio(user?.uid);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    const sub = subscribeStomp(`/topic/user-dividends/${user.uid}`, () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio', user.uid] });
    });
    return () => sub.unsubscribe();
  }, [user, queryClient]);

  const totalAssets = useMemo(() => {
    if (!portfolio) return 0;
    const held = Object.entries(portfolio.shares as Record<string, string>).reduce((sum, [id, qty]) => {
      const s = streamers.find(st => st.id === id);
      return sum + (s?.price ?? 0) * Number(qty);
    }, 0);
    return Number(portfolio.balance) + held;
  }, [portfolio, streamers]);

  const handleReset = () => {
    const shares = portfolio?.shares as Record<string, string> | undefined;
    if (Object.values(shares ?? {}).some(qty => Number(qty) > 0)) {
      alert('보유 종목을 모두 매도한 후 투자 자금을 초기화할 수 있습니다.');
      return;
    }
    if (!window.confirm('투자 자금을 100만원으로 초기화하시겠습니까?')) return;
    resetMutation.mutate();
  };

  const swipe = useSwipeGesture({
    activeTab,
    selectedStreamer,
    isDesktopLayout,
    onSwipeToTab: handleSwipeToTab,
  });
  const {
    swipeViewportRef, swipeViewportWidth, swipeOffset, isSwiping,
    activeSwipeIndex, isSwipeTab,
    handleSwipePointerDown, handleSwipePointerMove, finishSwipe, cancelSwipe,
  } = swipe;

  if (authChecking) {
    return (
      <div className="h-screen flex items-center justify-center font-mono surface-app text-dim-token">
        거래소 엔진 초기화 중...
      </div>
    );
  }

  const rightTab: Exclude<AppTab, 'profile'> = activeTab === 'profile' ? 'home' : activeTab;
  const balance = Number(portfolio?.balance ?? 0);

  const sidebarProps = {
    user,
    portfolio,
    history: history ?? [],
    streamers,
    totalAssets,
    isResetting: resetMutation.isPending,
    remainingResets: portfolio?.remainingResets ?? 3,
    onLoginGoogle: handleGoogleLogin,
    onLoginGuest: handleGuestLogin,
    onLogout: handleLogout,
    onReset: handleReset,
    onLinkGoogle: handleLinkGoogle,
    onSelect: handleSelectStreamer,
    onNavigate: handleNavigate,
  };

  const renderTabContent = (tab: AppTab) => {
    const inner = (() => { switch (tab) {
      case 'home':
        return (
          <HomeView
            streamers={streamers} portfolio={portfolio} user={user}
            totalAssets={totalAssets} history={history ?? []}
            recentlyViewedIds={recentlyViewedIds} onlineCount={onlineCount}
            onSelect={handleSelectStreamer} onNavigate={handleNavigate}
            onRemoveRecent={handleRemoveRecent} liveTrades={liveTrades}
          />
        );
      case 'prices':
        return (
          <PricesView
            streamers={streamers} selectedStreamer={selectedStreamer} user={user}
            onSelectStreamer={handleSelectStreamerForPrices} onBack={handleBackFromPrices}
            onOrder={handleOrderFromDetail} liveTrades={liveTrades}
            stocksLoading={stocksLoading}
          />
        );
      case 'chart':
        return <ChartView streamers={streamers} onSelect={handleSelectStreamer} />;
      case 'rankings':
        return <UserRankingView />;
      case 'order':
        return (
          <OrderView
            streamers={streamers} selectedStreamer={selectedStreamer} user={user}
            initialOrderType={initialOrderType}
            onSelectStreamer={handleSelectStreamerForOrder} onBack={handleBackFromOrder}
          />
        );
      case 'shop':
        return <ShopView streamers={streamers} user={user} balance={balance} portfolio={portfolio} />;
      case 'holdings':
        return (
          <HoldingsView
            portfolio={portfolio} streamers={streamers} history={history ?? []}
            onNavigate={handleNavigate} onSelect={handleSelectStreamer} onBack={handleBackFromHoldings}
          />
        );
      case 'settings':
        return <SettingsView userId={user?.uid} portfolio={portfolio} onBack={handleBackFromSettings} />;
      case 'guide':
        return <GuideView onBack={handleBackFromGuide} />;
      case 'announcements':
        return <AnnouncementArchiveView onBack={handleBackFromAnnouncements} />;
      default:
        return <Sidebar activeTab="profile" {...sidebarProps} />;
    }})();
    return <Suspense fallback={<TabFallback />}>{inner}</Suspense>;
  };

  const mobileRouteClass = mobileRouteMotion ? `mobile-route-enter-${mobileRouteMotion}` : '';

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row overflow-hidden surface-app">
      <AnnouncementPopup />

      {guestLimitNotice && (
        <GuestLimitModal
          notice={guestLimitNotice}
          nowMs={guestLimitNow}
          onGoogleLogin={handleGuestLimitGoogleLogin}
        />
      )}

      {suspensionNotice && (
        <SuspendedAccountModal notice={suspensionNotice} onLogout={handleLogout} />
      )}

      {isDesktopLayout && (
        <div className="flex shrink-0">
          <Sidebar activeTab={activeTab} {...sidebarProps} />
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-hidden surface-app">
        {isDesktopLayout && <DesktopTabBar activeTab={rightTab} onNavigate={handleNavigate} />}

        {isDesktopLayout && (
          <div className="flex-1 overflow-hidden">
            {renderTabContent(rightTab)}
          </div>
        )}

        {!isDesktopLayout && (
          <div
            ref={swipeViewportRef}
            className="flex-1 overflow-hidden touch-pan-y"
            onPointerDownCapture={(e) => {
              preloadAdjacentTabs(activeTab);
              handleSwipePointerDown(e);
            }}
            onPointerMoveCapture={handleSwipePointerMove}
            onPointerUpCapture={finishSwipe}
            onPointerCancelCapture={cancelSwipe}
          >
            {isSwipeTab ? (
              <div className={`h-full ${mobileRouteClass}`}>
                <div
                  className="h-full flex"
                  style={{
                    width: swipeViewportWidth ? swipeViewportWidth * SWIPE_TABS.length : '100%',
                    transform: `translate3d(${-activeSwipeIndex * swipeViewportWidth + swipeOffset}px, 0, 0)`,
                    transition: isSwiping ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  {SWIPE_TABS.map(tab => (
                    <div
                      key={tab}
                      className="h-full overflow-hidden shrink-0"
                      style={{ width: swipeViewportWidth || '100%' }}
                    >
                      {visitedTabs.has(tab) ? renderTabContent(tab) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`h-full ${mobileRouteClass}`}>
                {renderTabContent(activeTab)}
              </div>
            )}
          </div>
        )}
      </div>

      <MobileNavBar activeTab={activeTab} onNavigate={handleNavigate} />
    </div>
  );
}

export default App;
