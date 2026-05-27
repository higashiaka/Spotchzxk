import { useState, useMemo, useEffect } from 'react';
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
import { OrderView } from './components/order/OrderView';
import { ShopView } from './components/shop/ShopView';
import { HoldingsView } from './components/holdings/HoldingsView';
import AnnouncementPopup from './components/AnnouncementPopup';

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
  /** 가격 화면에서 선택된 종목 (null이면 목록 표시) / Selected stock in the price screen, null shows the list */
  const [selectedStreamer, setSelectedStreamer] = useState<Stock | null>(null);
  /** 주문 화면 진입 시 기본 주문 방향 / Initial order direction when opening the order screen */
  const [initialOrderType, setInitialOrderType] = useState<'buy' | 'sell'>('buy');
  /** 최근 본 종목 ID 목록 (최대 10개, 최신순) / Recently viewed stock IDs, latest first, max 10 */
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);
  /** 실시간 체결 피드 / Real-time trade feed */
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

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
        const initialTrades: LiveTrade[] = rawOrders.map(item => {
          const streamer = streamers.find(s => s.id === item.streamerId);
          return {
            streamerId: item.streamerId,
            streamerName: streamer ? streamer.name : item.streamerId,
            type: item.type as 'buy' | 'sell',
            quantity: item.quantity,
            price: item.executedPrice ?? item.estimatedPrice,
            timestamp: item.createdAt,
          };
        });
        setLiveTrades(initialTrades);
      })
      .catch(err => console.error('Failed to load recent orders', err));
  }, [streamers]);

  // STOMP /topic/trades 구독: 신규 체결을 목록 맨 앞에 추가
  // Subscribe to STOMP /topic/trades: prepend new trades
  useEffect(() => {
    const subscription = subscribeStomp('/topic/trades', (message) => {
      try {
        const trade = JSON.parse(message.body) as LiveTrade;
        setLiveTrades(prev => [trade, ...prev]);
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

  /** 종목 선택 핸들러: 가격 탭으로 이동 + 최근 본 목록 갱신 (최대 10개)
   *  Stock selection handler: navigates to prices tab and updates recently viewed list (max 10) */
  const handleSelectStreamer = (s: Stock) => {
    setSelectedStreamer(s);
    setActiveTab('prices');
    setRecentlyViewedIds(prev => [s.id, ...prev.filter(id => id !== s.id)].slice(0, 10));
  };

  const handleNavigate = (tab: AppTab) => {
    if (tab === 'prices') setSelectedStreamer(null);
    setActiveTab(tab);
  };

  const handleOrderFromDetail = (type: 'buy' | 'sell') => {
    setInitialOrderType(type);
    setActiveTab('order');
  };

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

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row overflow-hidden surface-app">
      <AnnouncementPopup />

      {/* 좌측 사이드바: 프로필·인증·포트폴리오 요약 포함
          Left sidebar: includes profile, auth, and portfolio summary */}
      <Sidebar
        activeTab={activeTab}
        user={user}
        portfolio={portfolio}
        history={history ?? []}
        streamers={streamers}
        totalAssets={totalAssets}
        isResetting={resetMutation.isPending}
        remainingResets={portfolio?.remainingResets ?? 3}
        onLoginGoogle={handleGoogleLogin}
        onLoginGuest={handleGuestLogin}
        onLogout={handleLogout}
        onReset={handleReset}
        onLinkGoogle={handleLinkGoogle}
        onSelect={handleSelectStreamer}
        onNavigate={handleNavigate}
      />

      {/* 우측 콘텐츠 영역: profile 탭 활성 시 모바일에서 숨김
          Right content area: hidden on mobile when the profile tab is active */}
      <div className={`${activeTab !== 'profile' ? 'flex' : 'hidden'} md:flex flex-col flex-1 overflow-hidden surface-app`}>

        <DesktopTabBar activeTab={rightTab} onNavigate={handleNavigate} />

        <div className="flex-1 overflow-hidden">
          {rightTab === 'home' && (
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
          )}
          {rightTab === 'prices' && (
            <PricesView
              streamers={streamers}
              selectedStreamer={selectedStreamer}
              onSelectStreamer={s => s ? handleSelectStreamer(s) : setSelectedStreamer(null)}
              onOrder={handleOrderFromDetail}
              liveTrades={liveTrades}
            />
          )}
          {rightTab === 'chart' && (
            <ChartView
              streamers={streamers}
              onSelect={handleSelectStreamer}
            />
          )}
          {rightTab === 'order' && (
            <OrderView
              streamers={streamers}
              selectedStreamer={selectedStreamer}
              user={user}
              initialOrderType={initialOrderType}
              onSelectStreamer={s => setSelectedStreamer(s)}
            />
          )}
          {rightTab === 'shop' && (
            <ShopView
              streamers={streamers}
              user={user}
              balance={balance}
            />
          )}
          {rightTab === 'holdings' && (
            <HoldingsView
              portfolio={portfolio}
              streamers={streamers}
              history={history ?? []}
              onNavigate={handleNavigate}
              onSelect={handleSelectStreamer}
            />
          )}
        </div>
      </div>

      {/* 모바일 하단 내비게이션 바 / Mobile bottom navigation bar */}
      <MobileNavBar activeTab={activeTab} onNavigate={handleNavigate} />
    </div>
  );
}

export default App;
