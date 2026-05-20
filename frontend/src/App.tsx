import { useState, useMemo, useEffect } from 'react';
import {
  signInWithPopup, signOut, onAuthStateChanged,
  User, signInAnonymously, signInWithCustomToken,
  linkWithPopup, signInWithCredential,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { subscribeStomp } from './lib/stompClient';
import { apiFetch } from './lib/api';
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
import AnnouncementPopup from './components/AnnouncementPopup';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const streamers = useStocks();
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [selectedStreamer, setSelectedStreamer] = useState<Stock | null>(null);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);

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
        setLiveTrades(initialTrades.slice(0, 50));
      })
      .catch(err => console.error('Failed to load recent orders', err));
  }, [streamers]);

  useEffect(() => {
    const subscription = subscribeStomp('/topic/trades', (message) => {
      try {
        const trade = JSON.parse(message.body) as LiveTrade;
        setLiveTrades(prev => [trade, ...prev].slice(0, 50));
      } catch (e) {
        console.error('Failed to parse trade message', e);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setUser(u);
      setAuthChecking(false);

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
          // 다음 auth 상태 변경 시 재시도
        }
      }
    });
    return () => unsub();
  }, []);

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch (err) { console.error(err); alert('Google 로그인에 실패했습니다.'); }
  };

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

  const handleLogout = async () => { await signOut(auth); };

  const handleLinkGoogle = async () => {
    if (!user) return;
    try {
      await linkWithPopup(user, googleProvider);
      await user.getIdToken(true);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') return;

      if (err.code === 'auth/credential-already-in-use') {
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

  const { data: portfolio } = usePortfolio(user?.uid);
  const { data: history } = useTransactionHistory(user?.uid);
  const resetMutation = useResetPortfolio(user?.uid);

  const handleReset = () => {
    if (!window.confirm('투자 자금을 1천만원으로 초기화하시겠습니까?\n보유 주식이 모두 삭제됩니다.')) return;
    resetMutation.mutate();
  };

  const totalAssets = useMemo(() => {
    if (!portfolio) return 0;
    const held = Object.entries(portfolio.shares as Record<string, number>).reduce((sum, [id, qty]) => {
      const s = streamers.find(st => st.id === id);
      return sum + (s?.price ?? 0) * qty;
    }, 0);
    return portfolio.balance + held;
  }, [portfolio, streamers]);

  const handleSelectStreamer = (s: Stock) => {
    setSelectedStreamer(s);
    setActiveTab('prices');
    setRecentlyViewedIds(prev => [s.id, ...prev.filter(id => id !== s.id)].slice(0, 10));
  };

  const handleRemoveRecent = (id: string) => {
    setRecentlyViewedIds(prev => prev.filter(rid => rid !== id));
  };

  if (authChecking) {
    return (
      <div className="h-screen flex items-center justify-center font-mono" style={{ background: '#080A0F', color: '#626B7A' }}>
        거래소 엔진 초기화 중...
      </div>
    );
  }

  const rightTab: Exclude<AppTab, 'profile'> = activeTab === 'profile' ? 'home' : activeTab;

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row overflow-hidden" style={{ background: '#080A0F' }}>
      <AnnouncementPopup />

      {/* 좌측 사이드바 */}
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
        onNavigate={setActiveTab}
      />

      {/* 우측 콘텐츠 영역 */}
      <div className={`${activeTab !== 'profile' ? 'flex' : 'hidden'} md:flex flex-col flex-1 overflow-hidden`}
        style={{ background: '#080A0F' }}>

        <DesktopTabBar activeTab={rightTab} onNavigate={setActiveTab} />

        <div className="flex-1 overflow-hidden">
          {rightTab === 'home' && (
            <HomeView
              streamers={streamers}
              portfolio={portfolio}
              user={user}
              totalAssets={totalAssets}
              history={history ?? []}
              recentlyViewedIds={recentlyViewedIds}
              onSelect={handleSelectStreamer}
              onNavigate={setActiveTab}
              onRemoveRecent={handleRemoveRecent}
              liveTrades={liveTrades}
            />
          )}
          {rightTab === 'prices' && (
            <PricesView
              streamers={streamers}
              selectedStreamer={selectedStreamer}
              onSelectStreamer={s => setSelectedStreamer(s)}
              onNavigate={setActiveTab}
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
              onSelectStreamer={s => setSelectedStreamer(s)}
            />
          )}
        </div>
      </div>

      {/* 모바일 하단 네비 */}
      <MobileNavBar activeTab={activeTab} onNavigate={setActiveTab} />
    </div>
  );
}

export default App;
