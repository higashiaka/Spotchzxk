// 프로필 화면: 로그인, 계정 연동, 자산/주문/배당 내역을 사용자 기준으로 보여줍니다.
import { useState, useEffect } from 'react';
import { User, updateProfile } from 'firebase/auth';
import { Stock, DEFAULT_STOCKS } from '../../hooks/useStocks';
import { AppTab } from '../../types';
import { fmt, grade, priceColor } from '../../utils';
import { apiFetch } from '../../lib/api';
import { subscribeStomp } from '../../lib/stompClient';

export const ProfileView = ({
  user, portfolio, history, streamers, totalAssets, isAdmin: _isAdmin,
  onLoginGoogle, onLoginGuest, onLogout, onReset, onLinkGoogle, isResetting, remainingResets,
  onSelect, onNavigate,
}: {
  user: User | null;
  portfolio: any;
  history: any[];
  streamers: Stock[];
  totalAssets: number;
  isAdmin: boolean;
  onLoginGoogle: () => void;
  onLoginGuest: () => void;
  onLogout: () => void;
  onReset: () => void;
  onLinkGoogle: () => void;
  isResetting: boolean;
  remainingResets: number;
  onSelect: (s: Stock) => void;
  onNavigate: (tab: AppTab) => void;
}) => {
  const userGrade = grade(totalAssets);
  const holdingsValue = totalAssets - (portfolio?.balance ?? 0);
  const orderCount = history?.length ?? 0;

  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameUpdating, setNameUpdating] = useState(false);

  const currentName = nameOverride ?? (user?.displayName || '트레이더');

  const startEditName = () => {
    setNameInput(currentName);
    setIsEditingName(true);
  };

  const cancelEditName = () => {
    setIsEditingName(false);
    setNameInput('');
  };

  const saveEditName = async () => {
    if (!user) return;
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === currentName) { cancelEditName(); return; }
    setNameUpdating(true);
    try {
      await updateProfile(user, { displayName: trimmed });
      setNameOverride(trimmed);
      setIsEditingName(false);
    } catch {
      alert('이름 변경에 실패했습니다.');
    } finally {
      setNameUpdating(false);
    }
  };

  const [dividendHistory, setDividendHistory] = useState<any[]>([]);
  const [dividendHistoryLoaded, setDividendHistoryLoaded] = useState(false);

  const fetchDividendHistory = () => {
    apiFetch('/api/dividends/my')
      .then(res => res.ok ? res.json() : [])
      .then((data: any[]) => { setDividendHistory(data); setDividendHistoryLoaded(true); })
      .catch(() => setDividendHistoryLoaded(true));
  };

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    fetchDividendHistory();
  }, [user]);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    const sub = subscribeStomp('/topic/dividends', fetchDividendHistory);
    return () => sub.unsubscribe();
  }, [user]);

  const [addUrl, setAddUrl] = useState('');
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [addMsg, setAddMsg] = useState('');

  const handleAddStock = async () => {
    if (!addUrl.trim()) return;

    let channelId = addUrl.trim();
    if (channelId.includes("chzzk.naver.com")) {
      try {
        const urlStr = channelId.startsWith('http') ? channelId : `https://${channelId}`;
        const urlObj = new URL(urlStr);
        let path = urlObj.pathname.replace(/^\/|\/$/g, "");
        if (path.startsWith("live/")) {
          channelId = path.substring("live/".length);
        } else {
          channelId = path;
        }
      } catch (e) {
        setAddStatus('error');
        setAddMsg('올바르지 않은 URL 형식입니다.');
        setTimeout(() => setAddStatus('idle'), 3000);
        return;
      }
    }
    channelId = channelId.replace(/[?#].*/g, "").trim();

    const alreadyExists = streamers.some(s => s.id === channelId);
    if (alreadyExists) {
      setAddStatus('error');
      setAddMsg('이미 추가된 종목입니다.');
      setTimeout(() => setAddStatus('idle'), 3000);
      return;
    }

    setAddStatus('loading');
    try {
      const { apiFetch } = await import('../../lib/api');
      const res = await apiFetch('/api/stocks', {
        method: 'POST',
        body: JSON.stringify({ channelUrl: addUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAddStatus('error');
        setAddMsg(json.error || '추가 실패');
      } else {
        setAddStatus('ok');
        setAddMsg(`'${json.name}' 종목이 추가되었습니다.`);
        setAddUrl('');
      }
    } catch {
      setAddStatus('error');
      setAddMsg('서버 연결 실패');
    }
    setTimeout(() => setAddStatus('idle'), 3000);
  };

  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 border"
          style={{ background: '#1A2232', borderColor: '#222A3A' }}>
          <svg className="w-8 h-8" style={{ color: '#626B7A' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="text-white text-lg font-bold mb-2">로그인이 필요합니다</h2>
        <p className="text-sm mb-6" style={{ color: '#8491A5' }}>로그인하여 내 포트폴리오를 확인하세요</p>
        <div className="w-full space-y-3">
          <button type="button" onClick={onLoginGoogle}
            className="w-full bg-white text-gray-950 font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google 로그인
          </button>
          <button type="button" onClick={onLoginGuest}
            className="w-full font-bold px-6 py-3 rounded-xl border"
            style={{ background: '#1A2232', borderColor: '#222A3A', color: '#BAC4D1' }}>
            게스트로 플레이
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar">
      {/* 프로필 카드 */}
      <div className="rounded-2xl border p-5 mb-4 flex items-center gap-4"
        style={{ background: '#1A2232', borderColor: '#26334D' }}>
        <div className="w-14 h-14 rounded-full border flex items-center justify-center shrink-0 overflow-hidden"
          style={{ background: '#131924', borderColor: '#222A3A' }}>
          {user.photoURL
            ? <img src={user.photoURL} alt="profile" className="w-full h-full object-cover" />
            : <svg className="w-7 h-7" style={{ color: '#626B7A' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>}
        </div>
        <div className="flex-1 min-w-0">
          {user.isAnonymous ? (
            <p className="text-white font-bold truncate">게스트 투자자</p>
          ) : isEditingName ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEditName(); if (e.key === 'Escape') cancelEditName(); }}
                maxLength={20}
                placeholder="닉네임 입력"
                aria-label="닉네임 변경"
                className="text-white font-bold bg-transparent border-b outline-none w-full min-w-0"
                style={{ borderColor: '#00E676' }}
                disabled={nameUpdating}
              />
              <button type="button" onClick={saveEditName} disabled={nameUpdating}
                className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded"
                style={{ background: '#00E67622', color: '#00E676' }}>확인</button>
              <button type="button" onClick={cancelEditName} disabled={nameUpdating}
                className="shrink-0 text-xs px-1.5 py-0.5 rounded"
                style={{ background: '#FF525222', color: '#FF5252' }}>취소</button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group">
              <p className="text-white font-bold truncate">{currentName}</p>
              <button type="button" onClick={startEditName}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                title="이름 변경">
                <svg className="w-3.5 h-3.5" style={{ color: '#626B7A' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          )}
          <p className="text-xs font-mono mt-0.5" style={{ color: '#626B7A' }}>UID: {user.uid.slice(0, 8)}</p>
          <div className="mt-2 flex gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: userGrade.color + '26', color: userGrade.color }}>
              {userGrade.label}
            </span>
          </div>
        </div>
        <button type="button" onClick={onLogout}
          className="text-xs px-3 py-1.5 rounded-lg border shrink-0"
          style={{ background: '#131924', borderColor: '#222A3A', color: '#626B7A' }}>
          로그아웃
        </button>
      </div>

      {/* 게스트 → Google 계정 연동 배너 */}
      {(user.isAnonymous || !user.providerData.some(p => p.providerId === 'google.com')) && (
        <div className="rounded-2xl border p-4 mb-4 flex items-center gap-3"
          style={{ background: '#1A2232', borderColor: '#26334D' }}>
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold">Google 계정 연동</p>
            <p className="text-xs mt-0.5" style={{ color: '#8491A5' }}>포트폴리오를 안전하게 보관하세요</p>
          </div>
          <button type="button" onClick={onLinkGoogle}
            className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg"
            style={{ background: '#4285F426', color: '#7BAAF7' }}>
            연동하기
          </button>
        </div>
      )}

      {/* 보유 주식 */}
      <div className="mb-4">
        <h2 className="text-white text-sm font-bold mb-3">나의 스트리머 보유 주식</h2>
        {portfolio && Object.entries(portfolio.shares as Record<string, number>).filter(([, q]) => q > 0).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(portfolio.shares as Record<string, number>)
              .filter(([, qty]) => qty > 0)
              .map(([id, qty]) => {
                const s = streamers.find(st => st.id === id) || DEFAULT_STOCKS.find(ds => ds.id === id);
                if (!s) return null;
                const avgPrice = portfolio.avgPrices?.[id] ?? 0;
                const profitRate = avgPrice > 0 ? ((s.price - avgPrice) / avgPrice) * 100 : 0;
                return (
                  <div key={id} className="rounded-xl border p-4 cursor-pointer" style={{ background: '#131924', borderColor: '#222A3A' }}
                    onClick={() => { onSelect(s); onNavigate('prices'); }}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white text-sm font-bold">{s.name}</p>
                        <p className="text-xs mt-1" style={{ color: '#8491A5' }}>
                          {qty}주 · 평단 {fmt(avgPrice)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm font-mono text-white">{fmt(s.price)}</p>
                        <p className="text-xs font-bold mt-1" style={{ color: priceColor(profitRate) }}>
                          {profitRate >= 0 ? '+' : ''}{profitRate.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm"
            style={{ background: '#131924', borderColor: '#222A3A', color: '#626B7A' }}>
            보유 종목 없음. 거래를 시작하세요.
          </div>
        )}
      </div>

      {/* 모의투자 요약 */}
      <div className="rounded-xl border p-5 mb-4" style={{ background: '#131924', borderColor: '#222A3A' }}>
        <h3 className="text-sm font-bold mb-4" style={{ color: '#BAC4D1' }}>스트리머 투자 요약</h3>
        {[
          { label: '총 스트리머 자산', value: fmt(totalAssets) },
          { label: '캐시', value: fmt(portfolio?.balance ?? 0) },
          { label: '주식 평가액', value: fmt(holdingsValue) },
          { label: '누적 매매 횟수', value: `${orderCount}회` },
        ].map(row => (
          <div key={row.label} className="flex justify-between items-center mb-3 last:mb-0">
            <span className="text-sm" style={{ color: '#8491A5' }}>{row.label}</span>
            <span className="font-mono text-sm font-bold text-white">{row.value}</span>
          </div>
        ))}
      </div>

      {/* 배당 내역 */}
      {!user.isAnonymous && (
        <div className="rounded-xl border p-5 mb-4" style={{ background: '#131924', borderColor: '#222A3A' }}>
          <h3 className="text-sm font-bold mb-4" style={{ color: '#BAC4D1' }}>배당 내역</h3>
          {!dividendHistoryLoaded ? (
            <p className="text-xs text-center py-4" style={{ color: '#626B7A' }}>불러오는 중...</p>
          ) : dividendHistory.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: '#626B7A' }}>배당 수령 내역이 없습니다.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto hide-scrollbar">
              {dividendHistory.map((d, i) => {
                const s = streamers.find(st => st.id === d.channelId);
                const date = new Date(d.createdAt);
                const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                return (
                  <div key={i} className="flex items-center gap-3 py-2"
                    style={{ borderBottom: '1px solid #1A2232' }}>
                    <div className="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: s?.profileImageUrl ? 'transparent' : '#2A3448' }}>
                      {s?.profileImageUrl
                        ? <img src={s.profileImageUrl} alt="" className="w-full h-full object-cover" />
                        : d.streamerName.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{d.streamerName}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#626B7A' }}>{d.quantity}주 · {dateStr}</p>
                    </div>
                    <p className="text-sm font-bold font-mono shrink-0" style={{ color: '#00E676' }}>
                      +{Math.abs(Number(d.amount)).toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 종목 추가 */}
      {user.providerData.some(p => p.providerId === 'google.com') ? (
        <div className="rounded-xl border p-4 mb-4" style={{ background: '#131924', borderColor: '#222A3A' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#BAC4D1' }}>종목 추가</h3>
          <p className="text-xs mb-3" style={{ color: '#626B7A' }}>
            치지직 채널 URL 또는 채널 ID를 입력하세요
          </p>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="https://chzzk.naver.com/channel/abc123"
              value={addUrl}
              onChange={e => setAddUrl(e.target.value)}
              className="w-full rounded-xl border py-2.5 px-3 text-white text-sm focus:outline-none focus:border-blue-500"
              style={{ background: '#0E121A', borderColor: '#222A3A' }}
            />
            <button
              type="button"
              onClick={handleAddStock}
              disabled={addStatus === 'loading' || !addUrl.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
              style={{ background: '#3D8BFF', color: '#fff' }}
            >
              {addStatus === 'loading' ? '추가 중...' : '+ 종목 추가'}
            </button>
            {addStatus !== 'idle' && addMsg && (
              <p className="text-xs text-center" style={{ color: addStatus === 'ok' ? '#00E676' : '#FF5252' }}>
                {addMsg}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border p-4 mb-4" style={{ background: '#131924', borderColor: '#222A3A' }}>
          <h3 className="text-sm font-bold mb-2" style={{ color: '#BAC4D1' }}>종목 추가</h3>
          <p className="text-xs" style={{ color: '#626B7A' }}>
            종목 추가는 Google 로그인 후 이용할 수 있습니다.
          </p>
        </div>
      )}

      {/* 투자 자금 초기화 */}
      <button
        type="button"
        onClick={onReset}
        disabled={isResetting || remainingResets <= 0}
        className="w-full rounded-xl border px-4 py-3 flex justify-between items-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: '#1A2232', borderColor: '#222A3A' }}>
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-sm" style={{ color: '#BAC4D1' }}>투자 자금 초기화하기 (100만으로 세팅)</span>
          <span className="text-xs" style={{ color: remainingResets <= 0 ? '#FF5252' : '#626B7A' }}>
            오늘 남은 횟수: {remainingResets}회
          </span>
        </div>
        <span className="text-sm font-bold" style={{ color: isResetting || remainingResets <= 0 ? '#626B7A' : '#FF5252' }}>
          {isResetting ? '초기화 중...' : remainingResets <= 0 ? '오늘 완료' : '초기화 ›'}
        </span>
      </button>
    </div>
  );
};
