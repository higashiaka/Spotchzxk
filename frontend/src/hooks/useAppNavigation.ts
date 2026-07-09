import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useNavigationType } from 'react-router-dom';
import { AppTab } from '../types';
import { mapRawToStock, type Stock } from './useStocks';
import { apiFetch } from '../lib/api';

const STACKED_TABS = new Set<AppTab>(['order', 'holdings', 'settings', 'guide', 'announcements', 'feedback']);

const pendingStock = (stockId: string): Stock => ({
  id: stockId,
  name: '종목 로딩 중',
  price: 0,
  totalVolume: 0,
  dailyTradingValue: 0,
  basePrice: 0,
  isLive: false,
  totalSupply: 0,
});

function tabToPath(tab: AppTab, streamerId?: string | null): string {
  if (tab === 'home') return '/';
  if ((tab === 'prices' || tab === 'order') && streamerId) {
    return `/${tab}/${encodeURIComponent(streamerId)}`;
  }
  return `/${tab}`;
}

function parsePathname(pathname: string): { tab: AppTab; stockId: string | null } {
  const pricesMatch = pathname.match(/^\/prices\/([^/]+)\/?$/);
  if (pricesMatch) {
    try { return { tab: 'prices', stockId: decodeURIComponent(pricesMatch[1]) }; }
    catch { return { tab: 'prices', stockId: pricesMatch[1] }; }
  }
  const orderMatch = pathname.match(/^\/order\/([^/]+)\/?$/);
  if (orderMatch) {
    try { return { tab: 'order', stockId: decodeURIComponent(orderMatch[1]) }; }
    catch { return { tab: 'order', stockId: orderMatch[1] }; }
  }
  const tabMap: Record<string, AppTab> = {
    '/': 'home',
    '/prices': 'prices',
    '/chart': 'chart',
    '/rankings': 'rankings',
    '/order': 'order',
    '/shop': 'shop',
    '/holdings': 'holdings',
    '/settings': 'settings',
    '/guide': 'guide',
    '/announcements': 'announcements',
    '/feedback': 'feedback',
    '/profile': 'profile',
  };
  return { tab: tabMap[pathname] ?? 'home', stockId: null };
}

export function useAppNavigation(streamers: Stock[], isDesktopLayout: boolean) {
  const navigate = useNavigate();
  const location = useLocation();
  const navType = useNavigationType();

  const initialParsed = useRef(parsePathname(location.pathname)).current;

  const [activeTab, setActiveTab] = useState<AppTab>(initialParsed.tab);
  const [selectedStreamer, setSelectedStreamer] = useState<Stock | null>(() =>
    initialParsed.stockId ? pendingStock(initialParsed.stockId) : null
  );
  const [initialOrderType, setInitialOrderType] = useState<'buy' | 'sell'>('buy');
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);
  const [mobileRouteMotion, setMobileRouteMotion] = useState<'from-left' | 'from-right' | null>(null);

  const hasPushedRef = useRef(false);
  const selectedStreamerId = selectedStreamer?.id ?? null;

  // Resolve pending stock once streamer list loads
  useEffect(() => {
    if (!initialParsed.stockId || streamers.length === 0) return;
    const found = streamers.find(s => s.id === initialParsed.stockId);
    if (!found) return;
    setSelectedStreamer(current => {
      if (!current || current.id !== initialParsed.stockId) return current;
      return current.price === 0 ? found : current;
    });
  }, [streamers, initialParsed.stockId]);

  // Fallback: fetch individual stock if not in list
  useEffect(() => {
    if (!initialParsed.stockId) return;
    if (streamers.some(s => s.id === initialParsed.stockId)) return;
    let active = true;
    apiFetch(`/api/stocks/${encodeURIComponent(initialParsed.stockId)}`)
      .then(res => res.ok ? res.json() : null)
      .then(raw => { if (active && raw) setSelectedStreamer(mapRawToStock(raw)); })
      .catch(() => {});
    return () => { active = false; };
  }, [initialParsed.stockId, streamers]);

  // Resolve placeholder selection, but avoid replacing navigation state on every trade tick.
  useEffect(() => {
    if (!selectedStreamerId) return;
    const fresh = streamers.find(s => s.id === selectedStreamerId);
    if (!fresh) return;
    setSelectedStreamer(current => {
      if (!current || current.id !== selectedStreamerId) return current;
      return current.price === 0 ? fresh : current;
    });
  }, [streamers, selectedStreamerId]);

  // Sync state when browser back/forward changes location
  useEffect(() => {
    if (navType !== 'POP') return;
    const { tab, stockId } = parsePathname(location.pathname);
    const streamer = stockId ? streamers.find(s => s.id === stockId) ?? pendingStock(stockId) : null;
    setSelectedStreamer(streamer);
    setActiveTab(tab);
  }, [location.pathname, navType]);

  useEffect(() => {
    if (!mobileRouteMotion) return;
    const timer = window.setTimeout(() => setMobileRouteMotion(null), 240);
    return () => window.clearTimeout(timer);
  }, [mobileRouteMotion]);

  const prepareMobileRouteMotion = useCallback((targetTab: AppTab, isPop = false) => {
    if (isDesktopLayout) return;
    if (isPop) {
      setMobileRouteMotion('from-left');
      return;
    }
    const activeIsStacked = STACKED_TABS.has(activeTab);
    const targetIsStacked = STACKED_TABS.has(targetTab);
    if (!activeIsStacked && targetIsStacked) setMobileRouteMotion('from-right');
    else if (activeIsStacked && !targetIsStacked) setMobileRouteMotion('from-left');
  }, [activeTab, isDesktopLayout]);

  const goTo = useCallback((tab: AppTab, streamerId?: string | null, replace = false) => {
    const path = tabToPath(tab, streamerId);
    navigate(path, { replace });
    hasPushedRef.current = true;
    setActiveTab(tab);
  }, [navigate]);

  const handleGoBack = useCallback((fallbackTab: AppTab, fallbackStreamerId?: string | null) => {
    if (hasPushedRef.current) {
      prepareMobileRouteMotion(fallbackTab, true);
      navigate(-1);
    } else {
      prepareMobileRouteMotion(fallbackTab, true);
      goTo(fallbackTab, fallbackStreamerId, true);
    }
  }, [navigate, prepareMobileRouteMotion, goTo]);

  const handleSwipeToTab = useCallback((nextTab: AppTab) => {
    const streamerId = nextTab === 'prices' ? null : selectedStreamer?.id ?? null;
    if (nextTab === 'prices') setSelectedStreamer(null);
    setActiveTab(nextTab);
    navigate(tabToPath(nextTab, streamerId));
    hasPushedRef.current = true;
  }, [navigate, selectedStreamer?.id]);

  const handleSelectStreamer = useCallback((s: Stock) => {
    prepareMobileRouteMotion('prices');
    setSelectedStreamer(s);
    setActiveTab('prices');
    setRecentlyViewedIds(prev => [s.id, ...prev.filter(id => id !== s.id)].slice(0, 10));
    navigate(tabToPath('prices', s.id));
    hasPushedRef.current = true;
  }, [navigate, prepareMobileRouteMotion]);

  const handleNavigate = useCallback((tab: AppTab) => {
    prepareMobileRouteMotion(tab);
    if (tab === 'prices') setSelectedStreamer(null);
    setActiveTab(tab);
    navigate(tabToPath(tab, tab !== 'prices' ? selectedStreamer?.id : null));
    hasPushedRef.current = true;
  }, [navigate, prepareMobileRouteMotion, selectedStreamer?.id]);

  const handleOrderFromDetail = useCallback((type: 'buy' | 'sell') => {
    prepareMobileRouteMotion('order');
    setInitialOrderType(type);
    setActiveTab('order');
    navigate(tabToPath('order', selectedStreamer?.id));
    hasPushedRef.current = true;
  }, [navigate, prepareMobileRouteMotion, selectedStreamer?.id]);

  const handleSelectStreamerForPrices = useCallback((s: Stock | null) => {
    if (s) handleSelectStreamer(s);
    else setSelectedStreamer(null);
  }, [handleSelectStreamer]);

  const handleSelectStreamerForOrder = useCallback((s: Stock) => {
    setSelectedStreamer(s);
    navigate(tabToPath('order', s.id));
    hasPushedRef.current = true;
  }, [navigate]);

  const handleBackFromPrices = useCallback(
    () => handleGoBack('prices'),
    [handleGoBack],
  );

  const handleBackFromOrder = useCallback(
    () => handleGoBack('prices', selectedStreamer?.id ?? null),
    [handleGoBack, selectedStreamer?.id],
  );

  const handleBackFromHoldings = useCallback(
    () => handleGoBack('home'),
    [handleGoBack],
  );

  const handleBackFromSettings = useCallback(
    () => handleGoBack('profile'),
    [handleGoBack],
  );

  const handleBackFromGuide = useCallback(
    () => handleGoBack('profile'),
    [handleGoBack],
  );

  const handleBackFromAnnouncements = useCallback(
    () => handleGoBack('profile'),
    [handleGoBack],
  );

  const handleBackFromFeedback = useCallback(
    () => handleGoBack('profile'),
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
    handleBackFromFeedback,
    handleRemoveRecent,
  };
}
