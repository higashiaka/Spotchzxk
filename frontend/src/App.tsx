import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { PointerEvent } from 'react';
import {
  signInWithPopup, signOut, onAuthStateChanged,
  User, signInAnonymously,
  linkWithPopup, signInWithCredential,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { registerOnConnect, subscribeStomp } from './lib/stompClient';
import { apiFetch } from './lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useStocks, Stock } from './hooks/useStocks';
import { usePortfolio } from './hooks/usePortfolio';
import { useTransactionHistory } from './hooks/useTransactionHistory';
import { useResetPortfolio } from './hooks/useResetPortfolio';
import { AppTab, LiveTrade } from './types';

import { Sidebar } from './components/layout/Sidebar';
import { DesktopTabBar } from './components/layout/DesktopTabBar';
import { MobileNavBar } from './components/layout/MobileNavBar';
import { HomeView } from './components/home/HomeView';
import { PricesView } from './components/prices/PricesView';
import { ChartView } from './components/rankings/ChartView';
import { UserRankingView } from './components/rankings/UserRankingView';
import { OrderView } from './components/order/OrderView';
import { ShopView } from './components/shop/ShopView';
import { HoldingsView } from './components/holdings/HoldingsView';
import { SettingsView } from './components/settings/SettingsView';
import { GuideView } from './components/guide/GuideView';
import { AnnouncementArchiveView } from './components/announcements/AnnouncementArchiveView';
import AnnouncementPopup from './components/AnnouncementPopup';

const SWIPE_TABS: AppTab[] = ['home', 'prices', 'chart', 'rankings', 'shop', 'profile'];
type ScreenSnapshot = { tab: AppTab; streamerId: string | null };
type GuestLimitNotice = { retryAtMs: number };
const APP_HISTORY_KEY = 'spotchzxk-screen';
const HAS_LINKED_ACCOUNT_KEY = 'has_linked_account';
const GUEST_SOFT_LOGGED_OUT_KEY = 'guest_soft_logged_out';

const toBrowserHistoryState = (screen: ScreenSnapshot) => ({
  [APP_HISTORY_KEY]: true,
  screen,
});

const isBrowserHistoryState = (state: unknown): state is { screen: ScreenSnapshot } => {
  if (!state || typeof state !== 'object') return false;
  const candidate = state as { [APP_HISTORY_KEY]?: unknown; screen?: Partial<ScreenSnapshot> };
  return (
    candidate[APP_HISTORY_KEY] === true &&
    !!candidate.screen &&
    typeof candidate.screen.tab === 'string' &&
    (candidate.screen.streamerId === null || typeof candidate.screen.streamerId === 'string')
  );
};

const liveTradeKey = (trade: LiveTrade) =>
  trade.id ?? `${trade.streamerId}-${trade.timestamp}-${trade.type}-${trade.quantity}-${trade.price}`;

const guestLimitLabel = (retryAtMs: number, nowMs: number) => {
  const remainingSeconds = Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}분 ${seconds.toString().padStart(2, '0')}초`;
};

/** Root application component.
 *  Orchestrates Firebase authentication, tab routing,
 *  real-time trade feed (STOMP), and portfolio state. */
function App() {
  /** Current Firebase user, null if not logged in */
  const [user, setUser] = useState<User | null>(null);
  /** Whether the initial Firebase auth check is in progress */
  const [authChecking, setAuthChecking] = useState(true);
  /** Full stock list (updated in real time) */
  const streamers = useStocks();
  const queryClient = useQueryClient();
  /** Currently active tab */
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [screenHistory, setScreenHistory] = useState<ScreenSnapshot[]>([]);
  const swipeViewportRef = useRef<HTMLDivElement | null>(null);
  const swipeStartRef = useRef({ x: 0, y: 0, tabIndex: 0, pointerId: -1, horizontal: false });
  const [swipeViewportWidth, setSwipeViewportWidth] = useState(() => window.innerWidth);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [mobileRouteMotion, setMobileRouteMotion] = useState<'from-left' | 'from-right' | null>(null);
  /** Selected stock in the price screen, null shows the list */
  const [selectedStreamer, setSelectedStreamer] = useState<Stock | null>(null);
  /** Initial order direction when opening the order screen */
  const [initialOrderType, setInitialOrderType] = useState<'buy' | 'sell'>('buy');
  /** Recently viewed stock IDs, latest first, max 10 */
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);
  /** Real-time trade feed */
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);
  const streamerNameById = useMemo(
    () => new Map(streamers.map(streamer => [streamer.id, streamer.name])),
    [streamers]
  );
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [guestLimitNotice, setGuestLimitNotice] = useState<GuestLimitNotice | null>(null);
  const [guestLimitNow, setGuestLimitNow] = useState(Date.now());
  const currentScreenRef = useRef<ScreenSnapshot>({ tab: 'home', streamerId: null });
  const restoreFromBrowserRef = useRef(false);
  const prepareMobileRouteMotionRef = useRef<(targetTab: AppTab) => void>(() => {});
  const restoreScreenRef = useRef<(snapshot: ScreenSnapshot) => void>(() => {});

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const updateLayout = () => setIsDesktopLayout(media.matches);
    updateLayout();
    media.addEventListener('change', updateLayout);
    return () => media.removeEventListener('change', updateLayout);
  }, []);

  useEffect(() => {
    if (isDesktopLayout) return;
    const viewport = swipeViewportRef.current;
    if (!viewport) return;

    const updateWidth = () => setSwipeViewportWidth(viewport.clientWidth);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [isDesktopLayout, authChecking]);

  useEffect(() => {
    setSwipeOffset(0);
    setIsSwiping(false);
  }, [activeTab]);

  useEffect(() => {
    if (!mobileRouteMotion) return;
    const timer = window.setTimeout(() => setMobileRouteMotion(null), 240);
    return () => window.clearTimeout(timer);
  }, [mobileRouteMotion]);

  useEffect(() => {
    if (!guestLimitNotice) return;
    setGuestLimitNow(Date.now());
    const timer = window.setInterval(() => setGuestLimitNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [guestLimitNotice]);

  useEffect(() => {
    if (guestLimitNotice && guestLimitNow >= guestLimitNotice.retryAtMs) {
      setGuestLimitNotice(null);
    }
  }, [guestLimitNotice, guestLimitNow]);

  useEffect(() => {
    const loadOnlineCount = () => {
      apiFetch('/api/online-count')
      .then(res => res.ok ? res.json() : null)
      .then(payload => {
        if (payload && typeof payload.count === 'number') {
          setOnlineCount(payload.count);
        }
      })
      .catch(err => console.error('Failed to load online count', err));
    };

    loadOnlineCount();

    const subscription = subscribeStomp('/topic/online-count', message => {
      try {
        const payload = JSON.parse(message.body);
        if (typeof payload.count === 'number') {
          setOnlineCount(payload.count);
        }
      } catch (e) {
        console.error('Failed to parse online count message', e);
      }
    });
    const unregisterConnect = registerOnConnect(loadOnlineCount);

    return () => {
      subscription.unsubscribe();
      unregisterConnect();
    };
  }, []);

  // Load recent trades via REST on mount
  useEffect(() => {
    apiFetch('/api/orders/recent')
      .then(res => res.ok ? res.json() : null)
      .then((rawOrders: any[] | null) => {
        if (!rawOrders) return;
        const initialTrades: LiveTrade[] = rawOrders.map(item => ({
          id: item.id,
          streamerId: item.streamerId,
          streamerName: item.streamerName ?? item.streamerId,
          type: item.type as 'buy' | 'sell',
          quantity: item.quantity,
          price: item.executedPrice ?? item.estimatedPrice,
          timestamp: item.createdAt,
        }));
        setLiveTrades(prev => {
          const merged = new Map<string, LiveTrade>();
          [...initialTrades, ...prev].forEach(trade => {
            merged.set(liveTradeKey(trade), trade);
          });
          return [...merged.values()]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 50);
        });
      })
      .catch(err => console.error('Failed to load recent orders', err));
  }, []);

  useEffect(() => {
    setLiveTrades(prev => {
      let changed = false;
      const renamed = prev.map(trade => {
        const streamerName = streamerNameById.get(trade.streamerId);
        if (!streamerName || trade.streamerName === streamerName) return trade;
        changed = true;
        return { ...trade, streamerName };
      });
      return changed ? renamed : prev;
    });
  }, [streamerNameById]);

  // Subscribe to STOMP /topic/trades: prepend new trades
  useEffect(() => {
    const subscription = subscribeStomp('/topic/trades', (message) => {
      try {
        const trade = JSON.parse(message.body) as LiveTrade;
        setLiveTrades(prev => {
          const key = liveTradeKey(trade);
          if (prev.some(item => liveTradeKey(item) === key)) return prev;
          return [trade, ...prev].slice(0, 50);
        });
      } catch (e) {
        console.error('Failed to parse trade message', e);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Subscribe to Firebase auth state: detect login/logout and handle guest merge
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      const isSoftLoggedOutGuest =
        !!u && u.isAnonymous && localStorage.getItem(GUEST_SOFT_LOGGED_OUT_KEY) === 'true';
      setUser(isSoftLoggedOutGuest ? null : u);
      setAuthChecking(false);

      // After guest-to-Google linking, request server-side data merge
      const pendingGuestUid = localStorage.getItem('pendingGuestMerge');
      if (pendingGuestUid && u && u.providerData.some(p => p.providerId === 'google.com')) {
        localStorage.removeItem('pendingGuestMerge');
        try {
          const res = await apiFetch('/api/auth/link-google', {
            method: 'POST',
            body: JSON.stringify({ guestUid: pendingGuestUid }),
          });
          if (res.ok || res.status === 404 || res.status === 409) {
            localStorage.setItem(HAS_LINKED_ACCOUNT_KEY, 'true');
            if (res.status === 409) {
              alert('이미 사용 중인 Google 계정이라 게스트 자산을 자동 병합하지 않았습니다.');
            }
          } else {
            localStorage.setItem('pendingGuestMerge', pendingGuestUid);
          }
        } catch {
          localStorage.setItem('pendingGuestMerge', pendingGuestUid);
          // Retry on the next auth state change
        }
      }
    });
    return () => unsub();
  }, []);

  /** Handles Google sign-in via popup */
  const handleGoogleLogin = async () => {
    try {
      if (auth.currentUser?.isAnonymous && localStorage.getItem(GUEST_SOFT_LOGGED_OUT_KEY) === 'true') {
        await signOut(auth);
      }
      localStorage.removeItem(GUEST_SOFT_LOGGED_OUT_KEY);
      await signInWithPopup(auth, googleProvider);
    }
    catch (err) { console.error(err); alert('Google 로그인에 실패했습니다.'); }
  };

  /** Guest (anonymous) login handler. */
  const handleGuestLogin = async () => {
    try {
      let precheckToken: string | undefined;
      let fingerprintHash: string | undefined;

      if (localStorage.getItem(HAS_LINKED_ACCOUNT_KEY) === 'true') {
        alert('이미 Google 연동을 완료한 계정이 있습니다. Google 로그인으로 이용해 주세요.');
        await handleGoogleLogin();
        return;
      }
      localStorage.removeItem(GUEST_SOFT_LOGGED_OUT_KEY);

      if (!auth.currentUser) {
        const FP = await import('@fingerprintjs/fingerprintjs');
        const fp = await FP.load();
        const fpResult = await fp.get();
        fingerprintHash = fpResult.visitorId;
        const precheck = await apiFetch('/api/guest/precheck', {
          method: 'POST',
          body: JSON.stringify({ fingerprintHash }),
        });
        if (precheck.status === 429 || precheck.status === 403) {
          const body = await precheck.json().catch(() => ({}));
          const retryAfterSeconds = Number(body.retryAfterSeconds ?? 300);
          setGuestLimitNotice({ retryAtMs: Date.now() + retryAfterSeconds * 1000 });
          return;
        }
        if (!precheck.ok) {
          throw new Error('Guest precheck failed');
        }
        const precheckBody = await precheck.json().catch(() => ({}));
        precheckToken = typeof precheckBody.precheckToken === 'string'
          ? precheckBody.precheckToken
          : undefined;
        await signInAnonymously(auth);
      } else {
        setUser(auth.currentUser);
      }

      const res = await apiFetch('/api/guest/register', {
        method: 'POST',
        body: JSON.stringify({ precheckToken, fingerprintHash }),
      });
      if (res.status === 429 || res.status === 403) {
        const body = await res.json().catch(() => ({}));
        const retryAfterSeconds = Number(body.retryAfterSeconds ?? 300);
        await signOut(auth);
        setGuestLimitNotice({ retryAtMs: Date.now() + retryAfterSeconds * 1000 });
        return;
      }
      if (!res.ok) {
        throw new Error('Guest registration failed');
      }
    } catch (err) {
      console.error(err);
      alert('게스트 로그인 오류: Firebase Console에서 익명 로그인을 활성화하세요.');
    }
  };

  const handleGuestLimitGoogleLogin = async () => {
    setGuestLimitNotice(null);
    await handleGoogleLogin();
  };

  /** Logout handler */
  const handleLogout = async () => {
    if (auth.currentUser?.isAnonymous) {
      localStorage.setItem(GUEST_SOFT_LOGGED_OUT_KEY, 'true');
      setUser(null);
      queryClient.removeQueries({ queryKey: ['portfolio'] });
      queryClient.removeQueries({ queryKey: ['history'] });
      return;
    }
    localStorage.removeItem(GUEST_SOFT_LOGGED_OUT_KEY);
    await signOut(auth);
  };

  /** Google account linking handler.
   *  If the credential is already used by another account,
   *  stores the guest UID for merging then switches to that account. */
  const handleLinkGoogle = async () => {
    if (!user) return;
    try {
      await linkWithPopup(user, googleProvider);
      await user.getIdToken(true);
      localStorage.setItem(HAS_LINKED_ACCOUNT_KEY, 'true');
      try {
        const res = await apiFetch('/api/auth/upgrade-guest', { method: 'POST' });
        if (!res.ok) {
          console.error('Failed to upgrade guest after Google linking', res.status);
        }
      } catch (upgradeErr) {
        console.error('Failed to upgrade guest after Google linking', upgradeErr);
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') return;

      if (err.code === 'auth/credential-already-in-use') {
        // Merge guest data into the existing Google account: store UID to request server merge on auth change
        const guestUid = user.uid;
        localStorage.setItem(HAS_LINKED_ACCOUNT_KEY, 'true');
        localStorage.setItem('pendingGuestMerge', guestUid);
        try {
          await signInWithCredential(auth, err.credential);
        } catch (signInErr) {
          localStorage.removeItem('pendingGuestMerge');
          console.error(signInErr);
          alert('계정 연동 중 오류가 발생했습니다. 다시 시도해 주세요.');
        }
        return;
      }

      console.error(err);
      alert('Google 연동에 실패했습니다: ' + (err.message ?? ''));
    }
  };
  /** Current user's portfolio data */
  const { data: portfolio } = usePortfolio(user?.uid);
  /** Current user's transaction history */
  const { data: history } = useTransactionHistory(user?.uid);
  /** Portfolio reset mutation */
  const resetMutation = useResetPortfolio(user?.uid);

  // Invalidate the portfolio query immediately on dividend receipt → reflects balance/total assets in real time
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    const sub = subscribeStomp(`/topic/user-dividends/${user.uid}`, () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio', user.uid] });
    });
    return () => sub.unsubscribe();
  }, [user, queryClient]);

  /** Shows a confirmation dialog then executes the reset mutation */
  const handleReset = () => {
    const shares = portfolio?.shares as Record<string, number> | undefined;
    const hasHoldings = Object.values(shares ?? {}).some(qty => qty > 0);
    if (hasHoldings) {
      alert('보유 종목을 모두 매도한 후 투자 자금을 초기화할 수 있습니다.');
      return;
    }

    if (!window.confirm('투자 자금을 100만원으로 초기화하시겠습니까?')) return;
    resetMutation.mutate();
  };

  /** Total assets: cash + sum of (current price × held quantity), recalculated when portfolio or prices change */
  const totalAssets = useMemo(() => {
    if (!portfolio) return 0;
    const held = Object.entries(portfolio.shares as Record<string, number>).reduce((sum, [id, qty]) => {
      const s = streamers.find(st => st.id === id);
      return sum + (s?.price ?? 0) * qty;
    }, 0);
    return portfolio.balance + held;
  }, [portfolio, streamers]);

  const currentScreen = useMemo<ScreenSnapshot>(() => ({
    tab: activeTab,
    streamerId: selectedStreamer?.id ?? null,
  }), [activeTab, selectedStreamer?.id]);

  useEffect(() => {
    currentScreenRef.current = currentScreen;
  }, [currentScreen]);

  const sameScreen = useCallback(
    (a: ScreenSnapshot, b: ScreenSnapshot) =>
      a.tab === b.tab && a.streamerId === b.streamerId,
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
    const activeIsStacked = activeTab === 'order' || activeTab === 'holdings' || activeTab === 'settings' || activeTab === 'guide' || activeTab === 'announcements';
    const targetIsStacked = targetTab === 'order' || targetTab === 'holdings' || targetTab === 'settings' || targetTab === 'guide' || targetTab === 'announcements';

    if (activeIsStacked && !targetIsStacked) {
      setMobileRouteMotion('from-left');
      return;
    }
    if (!activeIsStacked && targetIsStacked) {
      setMobileRouteMotion('from-right');
    }
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
      window.setTimeout(() => {
        restoreFromBrowserRef.current = false;
      }, 0);
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

  /** Stock selection handler: navigates to prices tab and updates recently viewed list (max 10) */
  const handleSelectStreamer = useCallback((s: Stock) => {
    const target = { tab: 'prices' as AppTab, streamerId: s.id };
    pushCurrentScreen();
    prepareMobileRouteMotion('prices');
    pushBrowserScreen(target);
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

  const activeSwipeIndex = Math.max(0, SWIPE_TABS.indexOf(activeTab));
  const isSwipeTab = SWIPE_TABS.includes(activeTab);

  const handleSwipePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!isSwipeTab || event.pointerType === 'mouse') return;
    if (swipeStartRef.current.pointerId !== -1) return;
    if (event.nativeEvent.composedPath().some(
      el => el instanceof HTMLElement &&
        el.classList.contains('tv-lightweight-charts') &&
        el.dataset.swipeIgnore === 'true'
    )) return;
    swipeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      tabIndex: activeSwipeIndex,
      pointerId: event.pointerId,
      horizontal: false,
    };
  };

  const handleSwipePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    if (start.pointerId !== event.pointerId || !swipeViewportWidth) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.horizontal && Math.abs(dx) < 8) return;
    if (!start.horizontal && Math.abs(dy) > Math.abs(dx)) return;

    start.horizontal = true;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setIsSwiping(true);
    const isFirst = start.tabIndex === 0 && dx > 0;
    const isLast = start.tabIndex === SWIPE_TABS.length - 1 && dx < 0;
    const resistance = isFirst || isLast ? 0.28 : 1;
    setSwipeOffset(dx * resistance);
  };

  const finishSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    if (start.pointerId !== event.pointerId) return;

    const dx = event.clientX - start.x;
    const threshold = Math.min(90, Math.max(48, swipeViewportWidth * 0.18));
    let nextIndex = start.tabIndex;

    if (start.horizontal && dx <= -threshold) {
      nextIndex = Math.min(SWIPE_TABS.length - 1, start.tabIndex + 1);
    } else if (start.horizontal && dx >= threshold) {
      nextIndex = Math.max(0, start.tabIndex - 1);
    }

    setSwipeOffset(0);
    setIsSwiping(false);
    swipeStartRef.current.pointerId = -1;

    if (nextIndex !== start.tabIndex) {
      const nextTab = SWIPE_TABS[nextIndex];
      pushBrowserScreen({ tab: nextTab, streamerId: nextTab === 'prices' ? null : selectedStreamer?.id ?? null });
      if (nextTab === 'prices') setSelectedStreamer(null);
      setActiveTab(nextTab);
    }
  };

  const cancelSwipe = () => {
    setSwipeOffset(0);
    setIsSwiping(false);
    swipeStartRef.current.pointerId = -1;
    swipeStartRef.current.horizontal = false;
  };

  const handleOrderFromDetail = useCallback((type: 'buy' | 'sell') => {
    const target = { tab: 'order' as AppTab, streamerId: selectedStreamer?.id ?? null };
    pushCurrentScreen();
    prepareMobileRouteMotion('order');
    pushBrowserScreen(target);
    setInitialOrderType(type);
    setActiveTab('order');
  }, [prepareMobileRouteMotion, pushBrowserScreen, pushCurrentScreen, selectedStreamer?.id]);

  const handleSelectStreamerForPrices = useCallback((s: Stock | null) => {
    if (s) {
      handleSelectStreamer(s);
      return;
    }
    setSelectedStreamer(null);
  }, [handleSelectStreamer]);

  const handleSelectStreamerForOrder = useCallback((s: Stock) => {
    const target = { tab: 'order' as AppTab, streamerId: s.id };
    pushCurrentScreen();
    pushBrowserScreen(target);
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

  /** Removes a specific entry from the recently viewed list */
  const handleRemoveRecent = (id: string) => {
    setRecentlyViewedIds(prev => prev.filter(rid => rid !== id));
  };

  // Loading screen while the initial auth check runs
  if (authChecking) {
    return (
      <div className="h-screen flex items-center justify-center font-mono surface-app text-dim-token">
        거래소 엔진 초기화 중...
      </div>
    );
  }

  /** Profile tab is rendered only in the sidebar; right-side content falls back to home */
  const rightTab: Exclude<AppTab, 'profile'> = activeTab === 'profile' ? 'home' : activeTab;
  /** Current cash balance */
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
    if (tab === 'home') {
      return (
        <HomeView
          streamers={streamers}
          portfolio={portfolio}
          user={user}
          totalAssets={totalAssets}
          history={history ?? []}
          recentlyViewedIds={recentlyViewedIds}
          onlineCount={onlineCount}
          onSelect={handleSelectStreamer}
          onNavigate={handleNavigate}
          onRemoveRecent={handleRemoveRecent}
          liveTrades={liveTrades}
        />
      );
    }

    if (tab === 'prices') {
      return (
        <PricesView
          streamers={streamers}
          selectedStreamer={selectedStreamer}
          user={user}
          onSelectStreamer={handleSelectStreamerForPrices}
          onBack={handleBackFromPrices}
          onOrder={handleOrderFromDetail}
          liveTrades={liveTrades}
        />
      );
    }

    if (tab === 'chart') {
      return <ChartView streamers={streamers} onSelect={handleSelectStreamer} />;
    }

    if (tab === 'rankings') {
      return <UserRankingView />;
    }

    if (tab === 'order') {
      return (
        <OrderView
          streamers={streamers}
          selectedStreamer={selectedStreamer}
          user={user}
          initialOrderType={initialOrderType}
          onSelectStreamer={handleSelectStreamerForOrder}
          onBack={handleBackFromOrder}
        />
      );
    }

    if (tab === 'shop') {
      return <ShopView streamers={streamers} user={user} balance={balance} portfolio={portfolio} />;
    }

    if (tab === 'holdings') {
      return (
        <HoldingsView
          portfolio={portfolio}
          streamers={streamers}
          history={history ?? []}
          onNavigate={handleNavigate}
          onSelect={handleSelectStreamer}
          onBack={handleBackFromHoldings}
        />
      );
    }

    if (tab === 'settings') {
      return <SettingsView userId={user?.uid} portfolio={portfolio} onBack={handleBackFromSettings} />;
    }

    if (tab === 'guide') {
      return <GuideView onBack={handleBackFromGuide} />;
    }

    if (tab === 'announcements') {
      return <AnnouncementArchiveView onBack={handleBackFromAnnouncements} />;
    }

    return <Sidebar activeTab="profile" {...sidebarProps} />;
  };

  const mobileRouteClass = mobileRouteMotion
    ? `mobile-route-enter-${mobileRouteMotion}`
    : '';

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row overflow-hidden surface-app">
      <AnnouncementPopup />

      {guestLimitNotice && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-lg border border-primary-token surface-card p-5 shadow-2xl">
            <div className="mb-4">
              <h2 className="text-base font-extrabold text-white">비정상적인 접근이 감지되었습니다.</h2>
              <p className="mt-3 text-sm leading-relaxed text-secondary-token">
                현재 고객님의 네트워크 및 기기 환경에서 단시간 내에 과도한 게스트 계정 생성 시도가 확인되었습니다.
                시스템 보호 및 공정한 가상 거래 환경 유지를 위해 신규 게스트 로그인이 일시적으로 제한됩니다.
              </p>
              <p className="mt-3 text-sm font-bold text-white">
                제한 해제까지 남은 시간: {guestLimitLabel(guestLimitNotice.retryAtMs, guestLimitNow)}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-secondary-token">
                아래 구글 로그인을 이용하시면 대기 시간 없이 즉시 안전하게 나만의 고유 계정을 생성하고, 초기 자산과 함께 거래를 시작하실 수 있습니다.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleGuestLimitGoogleLogin}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:brightness-110"
              >
                구글 계정으로 즉시 시작하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left sidebar: includes profile, auth, and portfolio summary */}
      {isDesktopLayout && (
        <div className="flex shrink-0">
          <Sidebar activeTab={activeTab} {...sidebarProps} />
        </div>
      )}

      {/* Right content area: hidden on mobile when the profile tab is active */}
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

      {/* Mobile bottom navigation bar */}
      <MobileNavBar activeTab={activeTab} onNavigate={handleNavigate} />
    </div>
  );
}

export default App;
