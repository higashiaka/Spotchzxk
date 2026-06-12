import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { AppTab } from '../types';
import { Stock } from './useStocks';

const APP_HISTORY_KEY = 'spotchzxk-screen';

export type ScreenSnapshot = { tab: AppTab; streamerId: string | null };

const toBrowserHistoryState = (screen: ScreenSnapshot) => ({ [APP_HISTORY_KEY]: true, screen });

const isBrowserHistoryState = (state: unknown): state is { screen: ScreenSnapshot } => {
  if (!state || typeof state !== 'object') return false;
  const c = state as { [APP_HISTORY_KEY]?: unknown; screen?: Partial<ScreenSnapshot> };
  return (
    c[APP_HISTORY_KEY] === true &&
    !!c.screen &&
    typeof c.screen.tab === 'string' &&
    (c.screen.streamerId === null || typeof c.screen.streamerId === 'string')
  );
};

const STACKED_TABS = new Set<AppTab>(['order', 'holdings', 'settings', 'guide', 'announcements']);

function parseInitialScreen(): { tab: AppTab; stockId: string | null } {
  const match = window.location.pathname.match(/^\/stocks\/([^/]+)/);
  if (match) return { tab: 'prices', stockId: match[1] };
  return { tab: 'home', stockId: null };
}

export function useAppNavigation(streamers: Stock[], isDesktopLayout: boolean) {
  const initialScreen = useMemo(parseInitialScreen, []);
  const [activeTab, setActiveTab] = useState<AppTab>(initialScreen.tab);
  const [screenHistory, setScreenHistory] = useState<ScreenSnapshot[]>([]);
  const [selectedStreamer, setSelectedStreamer] = useState<Stock | null>(null);

  // URL로 직접 접근한 경우 streamers 로드 후 해당 종목 선택
  useEffect(() => {
    if (!initialScreen.stockId || selectedStreamer || streamers.length === 0) return;
    const found = streamers.find(s => s.id === initialScreen.stockId);
    if (found) setSelectedStreamer(found);
  }, [streamers, initialScreen.stockId, selectedStreamer]);
  const [initialOrderType, setInitialOrderType] = useState<'buy' | 'sell'>('buy');
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);
  const [mobileRouteMotion, setMobileRouteMotion] = useState<'from-left' | 'from-right' | null>(null);

  const currentScreenRef = useRef<ScreenSnapshot>({ tab: 'home', streamerId: null });
  const restoreFromBrowserRef = useRef(false);
  const prepareMobileRouteMotionRef = useRef<(targetTab: AppTab) => void>(() => {});
  const restoreScreenRef = useRef<(snapshot: ScreenSnapshot) => void>(() => {});

  useEffect(() => {
    if (!mobileRouteMotion) return;
    const timer = window.setTimeout(() => setMobileRouteMotion(null), 240);
    return () => window.clearTimeout(timer);
  }, [mobileRouteMotion]);

  const currentScreen = useMemo<ScreenSnapshot>(() => ({
    tab: activeTab,
    streamerId: selectedStreamer?.id ?? null,
  }), [activeTab, selectedStreamer?.id]);

  useEffect(() => {
    currentScreenRef.current = currentScreen;
  }, [currentScreen]);

  const sameScreen = useCallback(
    (a: ScreenSnapshot, b: ScreenSnapshot) => a.tab === b.tab && a.streamerId === b.streamerId,
    [],
  );

  const pushCurrentScreen = useCallback(() => {
    const snapshot = currentScreen;
    setScreenHistory(prev => {
      if (prev.length > 0 && sameScreen(prev[prev.length - 1], snapshot)) return prev;
      return [...prev, snapshot].slice(-20);
    });
  }, [currentScreen, sameScreen]);

  const restoreScreen = useCallback((snapshot: ScreenSnapshot) => {
    const streamer = snapshot.streamerId
      ? streamers.find(s => s.id === snapshot.streamerId) ?? null
      : null;
    setSelectedStreamer(streamer);
    setActiveTab(snapshot.tab);
  }, [streamers]);

  const pushBrowserScreen = useCallback((snapshot: ScreenSnapshot) => {
    if (restoreFromBrowserRef.current) return;
    if (sameScreen(currentScreenRef.current, snapshot)) return;
    window.history.pushState(toBrowserHistoryState(snapshot), '');
  }, [sameScreen]);

  const prepareMobileRouteMotion = useCallback((targetTab: AppTab) => {
    if (isDesktopLayout) return;
    const activeIsStacked = STACKED_TABS.has(activeTab);
    const targetIsStacked = STACKED_TABS.has(targetTab);
    if (activeIsStacked && !targetIsStacked) setMobileRouteMotion('from-left');
    else if (!activeIsStacked && targetIsStacked) setMobileRouteMotion('from-right');
  }, [activeTab, isDesktopLayout]);

  useEffect(() => {
    prepareMobileRouteMotionRef.current = prepareMobileRouteMotion;
  }, [prepareMobileRouteMotion]);

  useEffect(() => {
    restoreScreenRef.current = restoreScreen;
  }, [restoreScreen]);

  useEffect(() => {
    window.history.replaceState(toBrowserHistoryState(currentScreenRef.current), '');

    const handlePopState = (event: PopStateEvent) => {
      if (!isBrowserHistoryState(event.state)) return;
      const target = event.state.screen;
      restoreFromBrowserRef.current = true;
      setScreenHistory(prev => prev.slice(0, -1));
      prepareMobileRouteMotionRef.current(target.tab);
      restoreScreenRef.current(target);
      window.setTimeout(() => { restoreFromBrowserRef.current = false; }, 0);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleGoBack = useCallback((fallback: ScreenSnapshot) => {
    if (screenHistory.length > 0) {
      window.history.back();
      return;
    }
    prepareMobileRouteMotion(fallback.tab);
    restoreScreen(fallback);
  }, [prepareMobileRouteMotion, restoreScreen, screenHistory.length]);

  const handleSwipeToTab = useCallback((nextTab: AppTab) => {
    pushBrowserScreen({ tab: nextTab, streamerId: nextTab === 'prices' ? null : selectedStreamer?.id ?? null });
    if (nextTab === 'prices') setSelectedStreamer(null);
    setActiveTab(nextTab);
  }, [pushBrowserScreen, selectedStreamer?.id]);

  const handleSelectStreamer = useCallback((s: Stock) => {
    pushCurrentScreen();
    prepareMobileRouteMotion('prices');
    pushBrowserScreen({ tab: 'prices', streamerId: s.id });
    setSelectedStreamer(s);
    setActiveTab('prices');
    setRecentlyViewedIds(prev => [s.id, ...prev.filter(id => id !== s.id)].slice(0, 10));
  }, [prepareMobileRouteMotion, pushBrowserScreen, pushCurrentScreen]);

  const handleNavigate = useCallback((tab: AppTab) => {
    const target = { tab, streamerId: tab === 'prices' ? null : selectedStreamer?.id ?? null };
    pushCurrentScreen();
    prepareMobileRouteMotion(tab);
    pushBrowserScreen(target);
    if (tab === 'prices') setSelectedStreamer(null);
    setActiveTab(tab);
  }, [prepareMobileRouteMotion, pushBrowserScreen, pushCurrentScreen, selectedStreamer?.id]);

  const handleOrderFromDetail = useCallback((type: 'buy' | 'sell') => {
    pushCurrentScreen();
    prepareMobileRouteMotion('order');
    pushBrowserScreen({ tab: 'order', streamerId: selectedStreamer?.id ?? null });
    setInitialOrderType(type);
    setActiveTab('order');
  }, [prepareMobileRouteMotion, pushBrowserScreen, pushCurrentScreen, selectedStreamer?.id]);

  const handleSelectStreamerForPrices = useCallback((s: Stock | null) => {
    if (s) handleSelectStreamer(s);
    else setSelectedStreamer(null);
  }, [handleSelectStreamer]);

  const handleSelectStreamerForOrder = useCallback((s: Stock) => {
    pushCurrentScreen();
    pushBrowserScreen({ tab: 'order', streamerId: s.id });
    setSelectedStreamer(s);
  }, [pushBrowserScreen, pushCurrentScreen]);

  const handleBackFromPrices = useCallback(
    () => handleGoBack({ tab: 'prices', streamerId: null }),
    [handleGoBack],
  );

  const handleBackFromOrder = useCallback(
    () => handleGoBack({ tab: 'prices', streamerId: selectedStreamer?.id ?? null }),
    [handleGoBack, selectedStreamer?.id],
  );

  const handleBackFromHoldings = useCallback(
    () => handleGoBack({ tab: 'home', streamerId: null }),
    [handleGoBack],
  );

  const handleBackFromSettings = useCallback(
    () => handleGoBack({ tab: 'profile', streamerId: null }),
    [handleGoBack],
  );

  const handleBackFromGuide = useCallback(
    () => handleGoBack({ tab: 'profile', streamerId: null }),
    [handleGoBack],
  );

  const handleBackFromAnnouncements = useCallback(
    () => handleGoBack({ tab: 'profile', streamerId: null }),
    [handleGoBack],
  );

  const handleRemoveRecent = useCallback((id: string) => {
    setRecentlyViewedIds(prev => prev.filter(rid => rid !== id));
  }, []);

  return {
    activeTab,
    selectedStreamer,
    initialOrderType,
    recentlyViewedIds,
    mobileRouteMotion,
    handleNavigate,
    handleSwipeToTab,
    handleSelectStreamer,
    handleOrderFromDetail,
    handleSelectStreamerForPrices,
    handleSelectStreamerForOrder,
    handleBackFromPrices,
    handleBackFromOrder,
    handleBackFromHoldings,
    handleBackFromSettings,
    handleBackFromGuide,
    handleBackFromAnnouncements,
    handleRemoveRecent,
  };
}
