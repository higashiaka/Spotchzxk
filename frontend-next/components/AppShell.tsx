'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStocks } from '@/hooks/useStocks';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useTransactionHistory } from '@/hooks/useTransactionHistory';
import { useResetPortfolio } from '@/hooks/useResetPortfolio';
import { useAuth } from '@/hooks/useAuth';
import { useLiveTrades } from '@/hooks/useLiveTrades';
import { useOnlineCount } from '@/hooks/useOnlineCount';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { useSwipeGesture, SWIPE_TABS } from '@/hooks/useSwipeGesture';
import { subscribeStomp } from '@/lib/stompClient';
import { AppTab } from '@/types';

import { Sidebar } from '@/components/layout/Sidebar';
import { DesktopTabBar } from '@/components/layout/DesktopTabBar';
import { MobileNavBar } from '@/components/layout/MobileNavBar';
import { GuestLimitModal } from '@/components/common/GuestLimitModal';
import { HomeView } from '@/components/home/HomeView';
import { PricesView } from '@/components/prices/PricesView';
import { ChartView } from '@/components/rankings/ChartView';
import { UserRankingView } from '@/components/rankings/UserRankingView';
import { OrderView } from '@/components/order/OrderView';
import { ShopView } from '@/components/shop/ShopView';
import { HoldingsView } from '@/components/holdings/HoldingsView';
import { SettingsView } from '@/components/settings/SettingsView';
import { GuideView } from '@/components/guide/GuideView';
import { AnnouncementArchiveView } from '@/components/announcements/AnnouncementArchiveView';
import AnnouncementPopup from '@/components/AnnouncementPopup';

export function AppShell() {
  const [isDesktopLayout, setIsDesktopLayout] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : false
  );

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktopLayout(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const {
    user, authChecking,
    guestLimitNotice, guestLimitNow,
    handleGoogleLogin, handleGuestLogin, handleGuestLimitGoogleLogin,
    handleLogout, handleLinkGoogle,
  } = useAuth();

  const streamers = useStocks();
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
    const held = Object.entries(portfolio.shares as Record<string, number>).reduce((sum, [id, qty]) => {
      const s = streamers.find(st => st.id === id);
      return sum + (s?.price ?? 0) * qty;
    }, 0);
    return portfolio.balance + held;
  }, [portfolio, streamers]);

  const handleReset = () => {
    const shares = portfolio?.shares as Record<string, number> | undefined;
    if (Object.values(shares ?? {}).some(qty => qty > 0)) {
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
  const balance = portfolio?.balance ?? 0;

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
    switch (tab) {
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
    }
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
            onPointerDownCapture={handleSwipePointerDown}
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
                      {renderTabContent(tab)}
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
