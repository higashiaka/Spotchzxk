'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AppTab } from '@/types';
import { Stock } from './useStocks';

const TAB_TO_PATH: Record<AppTab, string> = {
  home: '/',
  prices: '/prices',
  chart: '/chart',
  rankings: '/rankings',
  order: '/order',
  shop: '/shop',
  holdings: '/holdings',
  settings: '/settings',
  guide: '/guide',
  announcements: '/announcements',
  profile: '/',
};

const PATH_TO_TAB: Record<string, AppTab> = {
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
};

const STACKED_TABS = new Set<AppTab>(['order', 'holdings', 'settings', 'guide', 'announcements']);

export function useAppNavigation(streamers: Stock[], isDesktopLayout: boolean) {
  const router = useRouter();
  const pathname = usePathname();

  const activeTab: AppTab = PATH_TO_TAB[pathname] ?? 'home';

  const [selectedStreamer, setSelectedStreamer] = useState<Stock | null>(null);
  const [initialOrderType, setInitialOrderType] = useState<'buy' | 'sell'>('buy');
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);
  const [mobileRouteMotion, setMobileRouteMotion] = useState<'from-left' | 'from-right' | null>(null);

  useEffect(() => {
    if (!mobileRouteMotion) return;
    const timer = window.setTimeout(() => setMobileRouteMotion(null), 240);
    return () => window.clearTimeout(timer);
  }, [mobileRouteMotion]);

  const prepareMobileRouteMotion = useCallback((targetTab: AppTab) => {
    if (isDesktopLayout) return;
    const activeIsStacked = STACKED_TABS.has(activeTab);
    const targetIsStacked = STACKED_TABS.has(targetTab);
    if (activeIsStacked && !targetIsStacked) setMobileRouteMotion('from-left');
    else if (!activeIsStacked && targetIsStacked) setMobileRouteMotion('from-right');
  }, [activeTab, isDesktopLayout]);

  const handleNavigate = useCallback((tab: AppTab) => {
    prepareMobileRouteMotion(tab);
    if (tab !== 'order') setSelectedStreamer(null);
    router.push(TAB_TO_PATH[tab]);
  }, [prepareMobileRouteMotion, router]);

  const handleSwipeToTab = useCallback((nextTab: AppTab) => {
    if (nextTab !== 'order') setSelectedStreamer(null);
    router.push(TAB_TO_PATH[nextTab]);
  }, [router]);

  const handleSelectStreamer = useCallback((s: Stock) => {
    prepareMobileRouteMotion('prices');
    setRecentlyViewedIds(prev => [s.id, ...prev.filter(id => id !== s.id)].slice(0, 10));
    router.push(`/stocks/${s.id}`);
  }, [prepareMobileRouteMotion, router]);

  const handleOrderFromDetail = useCallback((type: 'buy' | 'sell') => {
    if (!selectedStreamer) return;
    setInitialOrderType(type);
    router.push(`/stocks/${selectedStreamer.id}/order?type=${type}`);
  }, [router, selectedStreamer]);

  const handleSelectStreamerForPrices = useCallback((s: Stock | null) => {
    if (s) handleSelectStreamer(s);
  }, [handleSelectStreamer]);

  const handleSelectStreamerForOrder = useCallback((s: Stock) => {
    setSelectedStreamer(s);
  }, []);

  const handleBackFromPrices = useCallback(() => router.back(), [router]);
  const handleBackFromOrder = useCallback(() => router.back(), [router]);
  const handleBackFromHoldings = useCallback(() => router.back(), [router]);
  const handleBackFromSettings = useCallback(() => router.back(), [router]);
  const handleBackFromGuide = useCallback(() => router.back(), [router]);
  const handleBackFromAnnouncements = useCallback(() => router.back(), [router]);

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
