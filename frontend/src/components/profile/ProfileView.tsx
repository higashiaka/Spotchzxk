import { useState } from 'react';
import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { AppTab } from '../../types';
import { fmtKorean, fmtKoreanBigInt, parseBigBalance, fmtShares, grade } from '../../utils';
import { apiFetch } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useHoldings } from '../../hooks/useHoldings';
import { useDividendHistory } from '../../hooks/useDividendHistory';
import { useNicknameEdit } from '../../hooks/useNicknameEdit';
import { betaRewardTiers, betaTitleToneStyle, UserTitle } from '../rewards/betaRewards';

export const ProfileView = ({
  user, portfolio, history, streamers, totalAssets, isAdmin: _isAdmin,
  onLoginGoogle, onLoginNaver, onLoginGuest, onLogout, onReset, onLinkGoogle, onLinkNaver, naverLinked, isResetting, remainingResets,
  onSelect: _onSelect, onNavigate,
}: {
  user: User | null;
  portfolio: any;
  history: any[];
  streamers: Stock[];
  totalAssets: number | bigint;
  isAdmin: boolean;
  onLoginGoogle: () => void;
  onLoginNaver: () => void;
  onLoginGuest: () => void;
  onLogout: () => void;
  onReset: () => void;
  onLinkGoogle: () => void;
  onLinkNaver: () => void;
  naverLinked: boolean;
  isResetting: boolean;
  remainingResets: number;
  onSelect: (s: Stock) => void;
  onNavigate: (tab: AppTab) => void;
}) => {
  const queryClient = useQueryClient();
  const userGrade = !user?.isAnonymous && portfolio?.leagueRank != null
    ? grade(portfolio.leagueRank, portfolio.leagueTotal)
    : null;
  const orderCount = history?.length ?? 0;
  const { holdings, holdingCount } = useHoldings(portfolio, streamers);
  const holdingsValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
  const formattedTotalAssets = typeof totalAssets === 'bigint'
    ? fmtKoreanBigInt(totalAssets)
    : fmtKorean(totalAssets);

  const nicknameChangeTickets = Number(portfolio?.nicknameChangeTickets ?? 0);
  const stockAddTickets = Number(portfolio?.stockAddTickets ?? 0);
  const baseName = portfolio?.displayName || '트레이더';
  const ownedTitles: UserTitle[] = Array.isArray(portfolio?.titles) ? portfolio.titles : [];
  const selectedTitleId = portfolio?.selectedTitleId ? String(portfolio.selectedTitleId) : '';

  const {
    resolvedName, isEditingName, nameInput, nameUpdating,
    setNameInput, startEdit, cancelEdit, saveEdit,
  } = useNicknameEdit(user, baseName, nicknameChangeTickets);

  const { dividendHistory, dividendHistoryLoaded } = useDividendHistory(user);

  const [addUrl, setAddUrl] = useState('');
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [addMsg, setAddMsg] = useState('');

  const handleAddStock = async () => {
    const uid = user?.uid;
    if (!uid) return;
    if (!addUrl.trim()) return;

    let channelId = addUrl.trim();
    if (channelId.includes('chzzk.naver.com')) {
      try {
        const urlStr = channelId.startsWith('http') ? channelId : `https://${channelId}`;
        const urlObj = new URL(urlStr);
        let path = urlObj.pathname.replace(/^\/|\/$/g, '');
        channelId = path.startsWith('live/') ? path.substring('live/'.length) : path;
      } catch {
        setAddStatus('error');
        setAddMsg('올바르지 않은 URL 형식입니다.');
        setTimeout(() => setAddStatus('idle'), 3000);
        return;
      }
    }
    channelId = channelId.replace(/[?#].*/g, '').trim();

    if (streamers.some(s => s.id === channelId)) {
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
        queryClient.invalidateQueries({ queryKey: ['portfolio', uid] });
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
            <GoogleIcon />
            Google 로그인
          </button>
          <button type="button" onClick={onLoginNaver}
            className="w-full font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2"
            style={{ background: '#03C75A', color: '#fff' }}>
            <NaverIcon />
            Naver 로그인
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

  const isGoogleLinked = user.providerData.some(p => p.providerId === 'google.com');
  const isNaverLinked = naverLinked || user.providerData.some(p => p.providerId === 'oidc.naver');
  const isSocialLinked = isGoogleLinked || isNaverLinked;

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar touch-pan-y">
      {/* Profile card */}
      <div className="rounded-2xl border p-5 mb-4"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-secondary)' }}>
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
                <p className="text-white font-bold flex-1 min-w-0 truncate leading-snug">{resolvedName}</p>
                {!isEditingName && (
                  <button type="button" onClick={startEdit}
                    className="shrink-0 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="닉네임 변경">
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
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>닉네임 변경권 {nicknameChangeTickets}개</p>
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
        {!user.isAnonymous && isEditingName && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-primary)' }}>
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
              maxLength={8}
              placeholder="닉네임 입력 (최대 8자)"
              aria-label="닉네임 변경"
              className="block w-full text-white font-bold bg-transparent border-b outline-none pb-1"
              style={{ borderColor: 'var(--accent)' }}
              disabled={nameUpdating}
            />
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={saveEdit} disabled={nameUpdating}
                className="text-xs font-bold px-3 py-1 rounded"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>확인</button>
              <button type="button" onClick={cancelEdit} disabled={nameUpdating}
                className="text-xs px-3 py-1 rounded"
                style={{ background: '#FF525222', color: '#FF5252' }}>취소</button>
            </div>
          </div>
        )}
      </div>

      {/* Google account linking banner */}
      {(user.isAnonymous || !isGoogleLinked) && (
        <div className="rounded-2xl border p-4 mb-4 flex items-center gap-3"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-secondary)' }}>
          <GoogleIcon className="w-5 h-5 shrink-0" />
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

      {/* Naver account linking banner */}
      {!user.isAnonymous && !isNaverLinked && (
        <div className="rounded-2xl border p-4 mb-4 flex items-center gap-3"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-secondary)' }}>
          <NaverIcon className="w-5 h-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold">Naver 계정 연동</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Google 또는 Naver로 같은 포트폴리오를 사용하세요</p>
          </div>
          <button type="button" onClick={onLinkNaver}
            className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg"
            style={{ background: '#03C75A26', color: '#24D86F' }}>
            연동하기
          </button>
        </div>
      )}

      {/* Holdings shortcut */}
      <button type="button" onClick={() => onNavigate('holdings')}
        className="w-full rounded-2xl border p-4 mb-4 flex items-center gap-4 transition-colors hover:opacity-80 active:opacity-60"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-secondary)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent-soft)' }}>
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

      {/* Investment summary */}
      <div className="rounded-xl border p-5 mb-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
        <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-secondary)' }}>스트리머 투자 요약</h3>
        {[
          { label: '총 스트리머 자산', value: formattedTotalAssets },
          { label: '캐시', value: fmtKoreanBigInt(parseBigBalance(portfolio?.balance)) },
          { label: '주식 평가액', value: fmtKorean(holdingsValue) },
          { label: '누적 매매 횟수', value: `${orderCount}회` },
        ].map(row => (
          <div key={row.label} className="flex justify-between items-center mb-3 last:mb-0">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{row.label}</span>
            <span className="font-mono text-sm font-bold text-white">{row.value}</span>
          </div>
        ))}
      </div>

      {/* Beta reward titles */}
      <div className="rounded-xl border p-5 mb-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>베타 보상 칭호</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
              정식 전환 스냅샷 기준으로 지급됩니다.
            </p>
          </div>
          <span className="text-xs font-bold px-2 py-1 rounded-md border shrink-0"
            style={user.isAnonymous ? betaTitleToneStyle('gray') : betaTitleToneStyle('gold')}>
            {user.isAnonymous ? '보상 제외' : '지급 예정'}
          </span>
        </div>

        {ownedTitles.length > 0 ? (
          <div className="space-y-2">
            {ownedTitles.map(title => (
              <TitleRow key={title.id} title={title} selected={selectedTitleId === String(title.id)} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {betaRewardTiers.map(tier => (
              <div key={tier.id} className="flex items-center gap-3 py-2"
                style={{ borderBottom: '1px solid var(--bg-card)' }}>
                <span className="text-[11px] font-black px-2 py-1 rounded-md border shrink-0 max-w-[96px] text-center leading-tight"
                  style={betaTitleToneStyle(user.isAnonymous ? 'gray' : tier.tone)}>
                  {tier.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{tier.description}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                    {selectedTitleId === tier.id
                      ? '대표 칭호로 표시 중'
                      : user.isAnonymous ? 'Google 계정 기준 보상 대상' : tier.status === 'pending' ? '스냅샷 후 자동 지급 예정' : '베타 최종 랭킹 기준 선정'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dividend history */}
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
                const date = d.createdAt ? new Date(d.createdAt) : null;
                const dateStr = date && !Number.isNaN(date.getTime())
                  ? `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
                  : '-';
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
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{fmtShares(Number(d.quantity))} · {dateStr}</p>
                    </div>
                    <p className="text-sm font-bold font-mono shrink-0" style={{ color: 'var(--accent)' }}>
                      +{fmtKorean(Math.abs(Number(d.amount)))}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Stock addition */}
      {isSocialLinked ? (
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
            <button type="button" onClick={handleAddStock}
              disabled={addStatus === 'loading' || !addUrl.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
              style={{ background: '#3D8BFF', color: '#fff' }}>
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
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>종목 추가는 Google 또는 Naver 계정 연동 후 이용할 수 있습니다.</p>
        </div>
      )}

      {/* Fund reset */}
      <button type="button" onClick={onReset} disabled={isResetting || remainingResets <= 0}
        className="w-full rounded-xl border px-4 py-3 mb-3 flex justify-between items-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>투자 자금 초기화하기 (1,000만으로 세팅)</span>
          <span className="text-xs" style={{ color: remainingResets <= 0 ? '#FF5252' : 'var(--text-dim)' }}>
            오늘 남은 횟수: {remainingResets}회
          </span>
        </div>
        <span className="text-sm font-bold" style={{ color: isResetting || remainingResets <= 0 ? 'var(--text-dim)' : '#FF5252' }}>
          {isResetting ? '초기화 중...' : remainingResets <= 0 ? '오늘 완료' : '초기화 ›'}
        </span>
      </button>

      {/* Announcements shortcut */}
      <button type="button" onClick={() => onNavigate('announcements')}
        className="w-full rounded-xl border px-4 py-3 flex justify-between items-center transition-colors hover:opacity-80 active:opacity-60"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>지난 공지 보기</span>
        <span className="text-sm font-bold" style={{ color: 'var(--text-dim)' }}>›</span>
      </button>

      <button type="button" onClick={() => onNavigate('feedback')}
        className="w-full rounded-xl border px-4 py-3 mt-3 flex justify-between items-center transition-colors hover:opacity-80 active:opacity-60"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>문의 및 건의</span>
        <span className="text-sm font-bold" style={{ color: 'var(--text-dim)' }}>→</span>
      </button>
    </div>
  );
};

function TitleRow({ title, selected }: { title: UserTitle; selected: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--bg-card)' }}>
      <span className="text-xs font-black px-2 py-1 rounded-md border shrink-0" style={betaTitleToneStyle(title.tone)}>
        {title.label}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white truncate">{title.description || '획득한 칭호입니다.'}</p>
        {selected ? (
          <p className="text-xs mt-0.5" style={{ color: 'var(--accent)' }}>대표 칭호로 표시 중</p>
        ) : title.awardedAt && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            {new Date(title.awardedAt).toLocaleDateString('ko-KR')} 획득
          </p>
        )}
      </div>
    </div>
  );
}

const GoogleIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const NaverIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <span
    className={`${className} inline-flex items-center justify-center rounded-sm text-white font-black leading-none`}
    style={{ background: '#03C75A', fontSize: '0.72rem' }}
    aria-hidden="true"
  >
    N
  </span>
);
