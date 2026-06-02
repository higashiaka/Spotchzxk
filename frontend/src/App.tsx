import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { PointerEvent } from 'react';
import {
  signInWithPopup, signOut, onAuthStateChanged,
  User, signInAnonymously, signInWithCustomToken,
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
import AnnouncementPopup from './components/AnnouncementPopup';

const SWIPE_TABS: AppTab[] = ['home', 'prices', 'chart', 'rankings', 'shop', 'profile'];
type ScreenSnapshot = { tab: AppTab; streamerId: string | null };
const APP_HISTORY_KEY = 'spotchzxk-screen';

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

/** 앱 최상위 컴포넌트.
 *  Firebase 인증, 탭 라우팅, 실시간 체결 피드(STOMP), 포트폴리오 상태를 통합 관리
 *
 *  Root application component.
 *  Orchestrates Firebase authentication, tab routing,
 *  real-time trade feed (STOMP), and portfolio state. */
function App() {
  /** Firebase 인증 상태의 현재 사용자 (미로그인 시 null) / Current Firebase user, null if not logged in */
  const [user, setUser] = useState<User | null>(null);
  /** Firebase 초기 인증 확인 중 여부 (로딩 스플래시용) / Whether the initial Firebase auth check is in progress */
  const [authChecking, setAuthChecking] = useState(true);
  /** 전체 종목 목록 (실시간 갱신) / Full stock list (updated in real time) */
  const streamers = useStocks();
  /** 현재 활성 탭 / Currently active tab */
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [screenHistory, setScreenHistory] = useState<ScreenSnapshot[]>([]);
  const swipeViewportRef = useRef<HTMLDivElement | null>(null);
  const swipeStartRef = useRef({ x: 0, y: 0, tabIndex: 0, pointerId: -1, horizontal: false });
  const [swipeViewportWidth, setSwipeViewportWidth] = useState(() => window.innerWidth);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [mobileRouteMotion, setMobileRouteMotion] = useState<'from-left' | 'from-right' | null>(null);
  /** 가격 화면에서 선택된 종목 (null이면 목록 표시) / Selected stock in the price screen, null shows the list */
  const [selectedStreamer, setSelectedStreamer] = useState<Stock | null>(null);
  /** 주문 화면 진입 시 기본 주문 방향 / Initial order direction when opening the order screen */
  const [initialOrderType, setInitialOrderType] = useState<'buy' | 'sell'>('buy');
  /** 최근 본 종목 ID 목록 (최대 10개, 최신순) / Recently viewed stock IDs, latest first, max 10 */
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);
  /** 실시간 체결 피드 / Real-time trade feed */
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);
  const streamerNameById = useMemo(
    () => new Map(streamers.map(streamer => [streamer.id, streamer.name])),
    [streamers]
  );
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
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

  // 최근 체결 목록을 REST로 초기 로드 / Load recent trades via REST on mount
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

  // STOMP /topic/trades 구독: 신규 체결을 목록 맨 앞에 추가
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

  // Firebase 인증 상태 구독: 로그인·로그아웃 감지 및 게스트 병합 처리
  // Subscribe to Firebase auth state: detect login/logout and handle guest merge
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setUser(u);
      setAuthChecking(false);

      // 게스트 → Google 계정 연동 완료 후 서버 측 병합 요청
      // After guest-to-Google linking, request server-side data merge
      const pendingGuestUid = localStorage.getItem('pendingGuestMerge');
      if (pendingGuestUid && u && u.providerData.some(p => p.providerId === 'google.com')) {
        try {
          const res = await apiFetch('/api/auth/link-google', {
            method: 'POST',
            body: JSON.stringify({ guestUid: pendingGuestUid }),
          });
          if (res.ok || res.status === 404) {
            localStorage.removeItem('pendingGuestMerge');
          }
        } catch {
          // 다음 auth 상태 변경 시 재시도 / Retry on the next auth state change
        }
      }
    });
    return () => unsub();
  }, []);

  /** Google 팝업 로그인 핸들러
   *  Handles Google sign-in via popup */
  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch (err) { console.error(err); alert('Google 로그인에 실패했습니다.'); }
  };

  /** 게스트(익명) 로그인 핸들러.
   *  FingerprintJS로 기기 식별 후 서버 커스텀 토큰으로 재인증
   *
   *  Guest (anonymous) login handler.
   *  Identifies the device via FingerprintJS, then re-authenticates with a server-issued custom token. */
  const handleGuestLogin = async () => {
    try {
      const { user: anonUser } = await signInAnonymously(auth);
      const FP = await import('@fingerprintjs/fingerprintjs');
      const fp = await FP.load();
      const { visitorId: fingerprint } = await fp.get();
      const { API_BASE } = await import('./lib/api');
      const res = await fetch(`${API_BASE}/api/guest/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint, uid: anonUser.uid }),
      });
      if (res.ok) {
        const { customToken } = await res.json();
        if (customToken) { await signOut(auth); await signInWithCustomToken(auth, customToken); }
      }
    } catch (err) {
      console.error(err);
      alert('게스트 로그인 오류: Firebase Console에서 익명 로그인을 활성화하세요.');
    }
  };

  /** 로그아웃 핸들러 / Logout handler */
  const handleLogout = async () => { await signOut(auth); };

  /** Google 계정 연동 핸들러.
   *  이미 다른 계정에 연동된 경우 게스트 데이터를 병합 후 해당 계정으로 전환
   *
   *  Google account linking handler.
   *  If the credential is already used by another account,
   *  stores the guest UID for merging then switches to that account. */
  const handleLinkGoogle = async () => {
    if (!user) return;
    try {
      await linkWithPopup(user, googleProvider);
      await user.getIdToken(true);
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
        // 기존 Google 계정에 게스트 데이터를 병합: UID를 저장해 auth 변경 시 서버 요청
        // Merge guest data into the existing Google account: store UID to request server merge on auth change
        const guestUid = user.uid;
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

  const queryClient = useQueryClient();

  /** 현재 사용자의 포트폴리오 데이터 / Current user's portfolio data */
  const { data: portfolio } = usePortfolio(user?.uid);
  /** 현재 사용자의 체결 내역 / Current user's transaction history */
  const { data: history } = useTransactionHistory(user?.uid);
  /** 포트폴리오 초기화 뮤테이션 / Portfolio reset mutation */
  const resetMutation = useResetPortfolio(user?.uid);

  // 배당 수령 시 포트폴리오 쿼리를 즉시 무효화 → 캐시·총자산 실시간 반영
  // Invalidate the portfolio query immediately on dividend receipt → reflects balance/total assets in real time
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    const sub = subscribeStomp(`/topic/user-dividends/${user.uid}`, () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio', user.uid] });
    });
    return () => sub.unsubscribe();
  }, [user, queryClient]);

  /** 초기화 확인 대화상자 표시 후 뮤테이션 실행
   *  Shows a confirmation dialog then executes the reset mutation */
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

  /** 총 자산: 현금 잔고 + 보유 종목 현재가 합산 (포트폴리오·종목 가격 변경 시 재계산)
   *  Total assets: cash + sum of (current price × held quantity), recalculated when portfolio or prices change */
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
    const activeIsStacked = activeTab === 'order' || activeTab === 'holdings' || activeTab === 'settings';
    const targetIsStacked = targetTab === 'order' || targetTab === 'holdings' || targetTab === 'settings';

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

  /** 종목 선택 핸들러: 가격 탭으로 이동 + 최근 본 목록 갱신 (최대 10개)
   *  Stock selection handler: navigates to prices tab and updates recently viewed list (max 10) */
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

  /** 최근 본 종목에서 특정 항목 제거
   *  Removes a specific entry from the recently viewed list */
  const handleRemoveRecent = (id: string) => {
    setRecentlyViewedIds(prev => prev.filter(rid => rid !== id));
  };

  // 인증 초기 확인 중 로딩 화면 / Loading screen while the initial auth check runs
  if (authChecking) {
    return (
      <div className="h-screen flex items-center justify-center font-mono surface-app text-dim-token">
        거래소 엔진 초기화 중...
      </div>
    );
  }

  /** profile 탭은 사이드바에서만 렌더링되므로, 우측 콘텐츠 탭은 home으로 폴백
   *  Profile tab is rendered only in the sidebar; right-side content falls back to home */
  const rightTab: Exclude<AppTab, 'profile'> = activeTab === 'profile' ? 'home' : activeTab;
  /** 현재 현금 잔고 / Current cash balance */
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

    return <Sidebar activeTab="profile" {...sidebarProps} />;
  };

  const mobileRouteClass = mobileRouteMotion
    ? `mobile-route-enter-${mobileRouteMotion}`
    : '';

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row overflow-hidden surface-app">
      <AnnouncementPopup />

      {/* 좌측 사이드바: 프로필·인증·포트폴리오 요약 포함
          Left sidebar: includes profile, auth, and portfolio summary */}
      {isDesktopLayout && (
        <div className="flex shrink-0">
          <Sidebar activeTab={activeTab} {...sidebarProps} />
        </div>
      )}

      {/* 우측 콘텐츠 영역: profile 탭 활성 시 모바일에서 숨김
          Right content area: hidden on mobile when the profile tab is active */}
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
            onPointerDown={handleSwipePointerDown}
            onPointerMove={handleSwipePointerMove}
            onPointerUp={finishSwipe}
            onPointerCancel={cancelSwipe}
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

      {/* 모바일 하단 내비게이션 바 / Mobile bottom navigation bar */}
      <MobileNavBar activeTab={activeTab} onNavigate={handleNavigate} />
    </div>
  );
}

export default App;
