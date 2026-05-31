import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import { Stock } from '../../hooks/useStocks';
import { AppTab } from '../../types';
import { fmt, grade } from '../../utils';
import { apiFetch } from '../../lib/api';
import { subscribeStomp } from '../../lib/stompClient';
import { useHoldings } from '../../hooks/useHoldings';

/** 프로필 화면 컴포넌트.
 *  미로그인 시 로그인 화면, 로그인 시 보유 주식·투자 요약·배당 내역·종목 추가·자금 초기화를 표시
 *
 *  Profile screen component.
 *  Shows a login screen when not authenticated; when logged in, displays holdings,
 *  investment summary, dividend history, stock addition, and fund reset. */
export const ProfileView = ({
  user, portfolio, history, streamers, totalAssets, isAdmin: _isAdmin,
  onLoginGoogle, onLoginGuest, onLogout, onReset, onLinkGoogle, isResetting, remainingResets,
  onSelect: _onSelect, onNavigate,
}: {
  /** 로그인된 Firebase 사용자 (미로그인 시 null) / Authenticated Firebase user, null if not logged in */
  user: User | null;
  /** 서버에서 받아온 포트폴리오 데이터 / Portfolio data fetched from the server */
  portfolio: any;
  /** 체결 주문 내역 배열 / Array of completed order records */
  history: any[];
  /** 전체 종목 목록 / Full list of stocks */
  streamers: Stock[];
  /** 현금 + 보유 주식 평가액의 합산 총 자산 / Total assets = cash balance + evaluated holdings */
  totalAssets: number;
  /** 관리자 여부 (현재 미사용, 향후 확장용) / Admin flag (currently unused, reserved for future use) */
  isAdmin: boolean;
  /** Google 로그인 핸들러 / Google login handler */
  onLoginGoogle: () => void;
  /** 게스트 로그인 핸들러 / Guest login handler */
  onLoginGuest: () => void;
  /** 로그아웃 핸들러 / Logout handler */
  onLogout: () => void;
  /** 포트폴리오 초기화 핸들러 / Portfolio reset handler */
  onReset: () => void;
  /** Google 계정 연동 핸들러 / Google account linking handler */
  onLinkGoogle: () => void;
  /** 초기화 요청 진행 중 여부 / Whether a reset request is in progress */
  isResetting: boolean;
  /** 오늘 남은 초기화 횟수 / Remaining reset count for today */
  remainingResets: number;
  /** 종목 선택 핸들러 / Stock selection handler */
  onSelect: (s: Stock) => void;
  /** 탭 이동 핸들러 / Tab navigation handler */
  onNavigate: (tab: AppTab) => void;
}) => {
  const queryClient = useQueryClient();
  const userGrade = !user?.isAnonymous && portfolio?.leagueRank != null
    ? grade(portfolio.leagueRank, portfolio.leagueTotal)
    : null;
  /** 보유 주식 평가액 (총 자산 - 현금) / Evaluated holdings value (total assets minus cash) */
  const holdingsValue = totalAssets - (portfolio?.balance ?? 0);
  /** 누적 체결 주문 수 / Total number of completed orders */
  const orderCount = history?.length ?? 0;
  /** 보유 종목 수 (기본 종목 포함) / Number of held stocks (including defaults) */
  const { holdingCount } = useHoldings(portfolio, streamers, { includeDefaults: true });

  /** DB displayName 변경 후 즉시 반영할 오버라이드 이름
   *  Name override applied immediately after a backend displayName update */
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  /** 닉네임 편집 모드 여부 / Whether the nickname edit mode is active */
  const [isEditingName, setIsEditingName] = useState(false);
  /** 편집 중인 닉네임 입력값 / Current value of the nickname input */
  const [nameInput, setNameInput] = useState('');
  /** 닉네임 저장 요청 진행 중 여부 / Whether a nickname save request is in progress */
  const [nameUpdating, setNameUpdating] = useState(false);

  /** 오버라이드 → DB displayName → 기본값 순으로 표시할 현재 이름
   *  Display name resolved from: override → backend displayName → default */
  const currentName = nameOverride ?? (portfolio?.displayName || '트레이더');
  const nicknameChangeTickets = Number(portfolio?.nicknameChangeTickets ?? 0);
  const stockAddTickets = Number(portfolio?.stockAddTickets ?? 0);

  /** 닉네임 편집 모드 시작: 현재 이름으로 입력값을 초기화
   *  Starts nickname edit mode with the current name pre-filled */
  const startEditName = () => {
    setNameInput(currentName);
    setIsEditingName(true);
  };

  /** 닉네임 편집 취소 및 입력값 초기화
   *  Cancels nickname editing and clears the input */
  const cancelEditName = () => {
    setIsEditingName(false);
    setNameInput('');
  };

  /** 닉네임 저장: 서버에서 잔고 차감 후 DB displayName 변경
   *  Saves the nickname via the server, which charges the user and updates the DB */
  const saveEditName = async () => {
    if (!user) return;
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === currentName) { cancelEditName(); return; }
    if (nicknameChangeTickets <= 0) {
      alert('닉네임 변경권이 없습니다. 상점에서 먼저 구매해 주세요.');
      return;
    }
    setNameUpdating(true);
    try {
      const res = await apiFetch('/api/profile/nickname', {
        method: 'POST',
        body: JSON.stringify({ displayName: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || '닉네임 변경 실패');
      }
      setNameOverride(trimmed);
      setIsEditingName(false);
      queryClient.invalidateQueries({ queryKey: ['portfolio', user.uid] });
    } catch (e) {
      alert(e instanceof Error ? e.message : '이름 변경에 실패했습니다.');
    } finally {
      setNameUpdating(false);
    }
  };

  /** 서버에서 받아온 배당 내역 배열 / Dividend history records fetched from the server */
  const [dividendHistory, setDividendHistory] = useState<any[]>([]);
  /** 배당 내역 로드 완료 여부 (로딩 스피너 제어용) / Whether dividend history has finished loading */
  const [dividendHistoryLoaded, setDividendHistoryLoaded] = useState(false);

  /** 서버에서 내 배당 내역을 가져와 상태에 반영
   *  Fetches the user's dividend history from the server and updates state */
  const fetchDividendHistory = () => {
    apiFetch('/api/dividends/my')
      .then(res => res.ok ? res.json() : [])
      .then((data: any[]) => { setDividendHistory(data); setDividendHistoryLoaded(true); })
      .catch(() => setDividendHistoryLoaded(true));
  };

  // 로그인(비익명) 시 배당 내역 초기 로드 / Load dividend history on login (non-anonymous)
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    fetchDividendHistory();
  }, [user]);

  // STOMP 구독: 배당 발생 시 목록 갱신
  // STOMP subscriptions: refresh list on any dividend event
  useEffect(() => {
    if (!user || user.isAnonymous) return;

    // ① /topic/dividends: 구·신 백엔드 공통 — 전체 배당 이벤트 시 재조회
    const subGlobal = subscribeStomp('/topic/dividends', () => {
      fetchDividendHistory();
    });

    // ② /topic/user-dividends/{uid}: 신 백엔드 전용 — 내 배당 데이터를 즉시 목록 선두에 삽입
    const subPersonal = subscribeStomp(`/topic/user-dividends/${user.uid}`, (message) => {
      try {
        const entry = JSON.parse(message.body);
        setDividendHistory(prev => {
          if (prev.some(d => d.channelId === entry.channelId && d.createdAt === entry.createdAt)) {
            return prev;
          }
          return [entry, ...prev].slice(0, 50);
        });
      } catch {
        // parse 실패는 ① 재조회가 커버
      }
    });

    return () => {
      subGlobal.unsubscribe();
      subPersonal.unsubscribe();
    };
  }, [user]);

  /** 종목 추가 입력 URL / URL input for adding a new stock */
  const [addUrl, setAddUrl] = useState('');
  /** 종목 추가 요청 상태 / Stock addition request status */
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  /** 종목 추가 결과 메시지 / Result message for stock addition */
  const [addMsg, setAddMsg] = useState('');

  /** 종목 추가 핸들러.
   *  치지직 URL 또는 채널 ID를 파싱한 뒤 서버 POST /api/stocks 로 전송 */
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
    if (stockAddTickets <= 0) {
      setAddStatus('error');
      setAddMsg('종목 추가 티켓이 없습니다. 상점에서 먼저 구매해 주세요.');
      setTimeout(() => setAddStatus('idle'), 3000);
      return;
    }

    setAddStatus('loading');
    try {
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
        queryClient.invalidateQueries({ queryKey: ['portfolio', user.uid] });
      }
    } catch {
      setAddStatus('error');
      setAddMsg('서버 연결 실패');
    }
    setTimeout(() => setAddStatus('idle'), 3000);
  };

  // 미로그인 시: 로그인 화면 렌더링 / Not logged in: render login screen
  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 border"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
          <svg className="w-8 h-8" style={{ color: 'var(--text-dim)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="text-white text-lg font-bold mb-2">로그인이 필요합니다</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>로그인하여 내 포트폴리오를 확인하세요</p>
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
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
            게스트로 플레이
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar touch-pan-y">
      {/* 프로필 카드: 아바타, 이름 편집, 등급 배지, 로그아웃 버튼
          Profile card: avatar, name editing, grade badge, logout button */}
      <div className="rounded-2xl border p-5 mb-4"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-secondary)' }}>
        {/* 상단 행: 아바타 + 이름 정보 + 로그아웃 */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full border flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)' }}>
            {user.photoURL
              ? <img src={user.photoURL} alt="profile" className="w-full h-full object-cover" />
              : <svg className="w-7 h-7" style={{ color: 'var(--text-dim)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>}
          </div>
          <div className="flex-1 min-w-0">
            {user.isAnonymous ? (
              <p className="text-white font-bold truncate">게스트 투자자</p>
            ) : (
              <div className="flex items-center gap-1.5 group min-w-0">
                <p className="text-white font-bold flex-1 min-w-0 truncate leading-snug">
                  {currentName}
                </p>
                {!isEditingName && (
                  <button type="button" onClick={startEditName}
                    className="shrink-0 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity"
                    title={`이름 변경권 ${nicknameChangeTickets}개 보유`}>
                    <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>UID: {user.uid.slice(0, 8)}</p>
            {!user.isAnonymous && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                닉네임 변경권 {nicknameChangeTickets}개
              </p>
            )}
            {userGrade && (
              <div className="mt-2 flex gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: userGrade.color + '26', color: userGrade.color }}>
                  {userGrade.label}
                </span>
              </div>
            )}
          </div>
          <button type="button" onClick={onLogout}
            className="text-xs px-3 py-1.5 rounded-lg border shrink-0"
            style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)', color: 'var(--text-dim)' }}>
            로그아웃
          </button>
        </div>
        {/* 닉네임 편집 폼: 카드 전체 너비 사용 */}
        {!user.isAnonymous && isEditingName && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-primary)' }}>
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveEditName(); if (e.key === 'Escape') cancelEditName(); }}
              maxLength={8}
              placeholder="닉네임 입력 (최대 8자)"
              aria-label="닉네임 변경"
              className="block w-full text-white font-bold bg-transparent border-b outline-none pb-1"
              style={{ borderColor: 'var(--accent)' }}
              disabled={nameUpdating}
            />
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={saveEditName} disabled={nameUpdating}
                className="text-xs font-bold px-3 py-1 rounded"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>확인</button>
              <button type="button" onClick={cancelEditName} disabled={nameUpdating}
                className="text-xs px-3 py-1 rounded"
                style={{ background: '#FF525222', color: '#FF5252' }}>취소</button>
            </div>
          </div>
        )}
      </div>

      {/* Google 계정 미연동 시 연동 유도 배너
          Prompt banner for linking a Google account when not yet linked */}
      {(user.isAnonymous || !user.providerData.some(p => p.providerId === 'google.com')) && (
        <div className="rounded-2xl border p-4 mb-4 flex items-center gap-3"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-secondary)' }}>
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold">Google 계정 연동</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>포트폴리오를 안전하게 보관하세요</p>
          </div>
          <button type="button" onClick={onLinkGoogle}
            className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg"
            style={{ background: '#4285F426', color: '#7BAAF7' }}>
            연동하기
          </button>
        </div>
      )}

      {/* 보유 주식 바로가기 버튼 / Holdings shortcut button */}
      <button
        type="button"
        onClick={() => onNavigate('holdings')}
        className="w-full rounded-2xl border p-4 mb-4 flex items-center gap-4 transition-colors hover:opacity-80 active:opacity-60"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-secondary)' }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent-soft)' }}
        >
          <svg className="w-5 h-5" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <div className="flex-1 text-left">
          <p className="text-white text-sm font-bold">나의 스트리머 보유 주식</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {holdingCount > 0 ? `${holdingCount}개 종목 보유 중` : '보유 종목 없음'}
          </p>
        </div>
        <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--text-dim)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* 모의투자 요약 / Investment summary */}
      <div className="rounded-xl border p-5 mb-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
        <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-secondary)' }}>스트리머 투자 요약</h3>
        {[
          { label: '총 스트리머 자산', value: fmt(totalAssets) },
          { label: '캐시', value: fmt(portfolio?.balance ?? 0) },
          { label: '주식 평가액', value: fmt(holdingsValue) },
          { label: '누적 매매 횟수', value: `${orderCount}회` },
        ].map(row => (
          <div key={row.label} className="flex justify-between items-center mb-3 last:mb-0">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{row.label}</span>
            <span className="font-mono text-sm font-bold text-white">{row.value}</span>
          </div>
        ))}
      </div>

      {/* 배당 내역 (비익명 사용자만 표시) / Dividend history (non-anonymous users only) */}
      {!user.isAnonymous && (
        <div className="rounded-xl border p-5 mb-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
          <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-secondary)' }}>배당 내역</h3>
          {!dividendHistoryLoaded ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-dim)' }}>불러오는 중...</p>
          ) : dividendHistory.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-dim)' }}>배당 수령 내역이 없습니다.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto hide-scrollbar">
              {dividendHistory.map((d, i) => {
                const s = streamers.find(st => st.id === d.channelId);
                const date = new Date(d.createdAt);
                const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                return (
                  <div key={i} className="flex items-center gap-3 py-2"
                    style={{ borderBottom: '1px solid var(--bg-card)' }}>
                    <div className="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: s?.profileImageUrl ? 'transparent' : 'var(--bg-card)' }}>
                      {s?.profileImageUrl
                        ? <img src={s.profileImageUrl} alt="" className="w-full h-full object-cover" />
                        : d.streamerName.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{d.streamerName}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{d.quantity}주 · {dateStr}</p>
                    </div>
                    <p className="text-sm font-bold font-mono shrink-0" style={{ color: 'var(--accent)' }}>
                      +{Math.abs(Number(d.amount)).toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 종목 추가: Google 연동 계정만 허용 / Stock addition: Google-linked accounts only */}
      {user.providerData.some(p => p.providerId === 'google.com') ? (
        <div className="rounded-xl border p-4 mb-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-secondary)' }}>종목 추가</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
            치지직 채널 URL 또는 채널 ID를 입력하세요. 보유 티켓 {stockAddTickets}개
          </p>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="https://chzzk.naver.com/channel/abc123"
              value={addUrl}
              onChange={e => setAddUrl(e.target.value)}
              className="w-full rounded-xl border py-2.5 px-3 text-white text-sm focus:outline-none focus:border-blue-500"
              style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)' }}
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
              <p className="text-xs text-center" style={{ color: addStatus === 'ok' ? 'var(--accent)' : '#FF5252' }}>
                {addMsg}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border p-4 mb-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
          <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>종목 추가</h3>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            종목 추가는 Google 로그인 후 이용할 수 있습니다.
          </p>
        </div>
      )}
      {/* 투자 자금 초기화 버튼 / Fund reset button */}
      <button
        type="button"
        onClick={onReset}
        disabled={isResetting || remainingResets <= 0}
        className="w-full rounded-xl border px-4 py-3 flex justify-between items-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>투자 자금 초기화하기 (100만으로 세팅)</span>
          <span className="text-xs" style={{ color: remainingResets <= 0 ? '#FF5252' : 'var(--text-dim)' }}>
            오늘 남은 횟수: {remainingResets}회
          </span>
        </div>
        <span className="text-sm font-bold" style={{ color: isResetting || remainingResets <= 0 ? 'var(--text-dim)' : '#FF5252' }}>
          {isResetting ? '초기화 중...' : remainingResets <= 0 ? '오늘 완료' : '초기화 ›'}
        </span>
      </button>
    </div>
  );
};
