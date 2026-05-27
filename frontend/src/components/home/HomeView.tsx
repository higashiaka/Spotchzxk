import { useState, useMemo, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { AppTab, LiveTrade } from '../../types';
import { fmt, fmtCompact, changePct, priceColor, avatarColor, INITIAL_BALANCE, grade } from '../../utils';
import { Ticker } from '../Ticker';
import { MegaphonePost, useMegaphonePosts } from '../../hooks/useMegaphone';
import { subscribeStomp } from '../../lib/stompClient';
import { useHoldings } from '../../hooks/useHoldings';

/** 홈 화면 컴포넌트.
 *  티커, 최신 확성기 배너, 투자 요약, 보유 종목(최대 3개),
 *  거래 현황 rows, 최근 본 종목, 실시간 거래 피드, 거래량 차트를 렌더링
 *
 *  Home screen component.
 *  Renders the ticker, latest megaphone banner, investment summary,
 *  holdings (up to 3), stat rows, recently viewed, live trade feed,
 *  and volume chart */
export const HomeView = ({
  streamers, portfolio, user, totalAssets, history, recentlyViewedIds,
  onlineCount, onSelect, onNavigate, onRemoveRecent, liveTrades,
}: {
  /** 전체 종목 목록 / Full list of stocks */
  streamers: Stock[];
  /** 포트폴리오 데이터 / Portfolio data */
  portfolio: any;
  /** 로그인 사용자 / Authenticated user */
  user: User | null;
  /** 총 자산 (현금 + 주식 평가액) / Total assets (cash + stock market value) */
  totalAssets: number;
  /** 주문/거래 내역 목록 / Order and transaction history list */
  history: any[];
  /** 최근 본 종목 ID 배열 (최신순) / Recently viewed stock IDs in recency order */
  recentlyViewedIds: string[];
  /** 현재 동시 접속자 수 / Current online connection count */
  onlineCount: number | null;
  /** 종목 선택 핸들러 / Stock selection handler */
  onSelect: (s: Stock) => void;
  /** 탭 전환 핸들러 / Tab navigation handler */
  onNavigate: (tab: AppTab) => void;
  /** 최근 본 종목 제거 핸들러 / Handler to remove a stock from recently viewed */
  onRemoveRecent: (id: string) => void;
  /** 실시간 체결 내역 / Live trade events */
  liveTrades: LiveTrade[];
}) => {
  /** 주문내역 모달 표시 여부 / Whether the order history modal is visible */
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  /** 전체 거래 피드 모달 표시 여부 / Whether the full trade feed modal is visible */
  const [showTradeFeed, setShowTradeFeed] = useState(false);

  const { data: initialPosts = [] } = useMegaphonePosts();
  /** 배너에 표시할 최신 확성기 게시물 / Latest megaphone post shown in the banner */
  const [latestMegaphone, setLatestMegaphone] = useState<MegaphonePost | null>(null);

  // REST 초기 로드 후 가장 최신 게시물을 배너에 표시
  // Display the most recent post in the banner after initial REST load
  useEffect(() => {
    if (initialPosts.length > 0) setLatestMegaphone(initialPosts[0]);
  }, [initialPosts]);

  // STOMP 실시간 확성기 이벤트 수신 / Receive real-time megaphone events via STOMP
  useEffect(() => {
    const sub = subscribeStomp('/topic/megaphone', msg => {
      try { setLatestMegaphone(JSON.parse(msg.body) as MegaphonePost); } catch { /* ignore */ }
    });
    return () => sub.unsubscribe();
  }, []);

  /** 총 수익 (총 자산 - 초기 투자금) / Total return (total assets - initial balance) */
  const totalReturn = totalAssets - INITIAL_BALANCE;
  /** 총 수익률 (%) / Total return rate in % */
  const totalReturnPct = (totalReturn / INITIAL_BALANCE) * 100;
  /** 총 자산 기준 투자 등급 / Investor grade based on total assets */
  const userGrade = grade(totalAssets);
  /** 봇 거래 활동을 반영한 표시용 동접자 수 / Display count adjusted for bot trading activity */
  const displayedOnlineCount = (onlineCount ?? 0) + 5;

  /** 보유 종목 목록 (평가금액 내림차순)
   *  Holdings sorted by value descending */
  const { holdings, holdingCount } = useHoldings(portfolio, streamers);

  /** 최근 본 종목 Stock 객체 배열 (ID 순서 유지)
   *  Recently viewed Stock objects in recency order */
  const recentlyViewed = useMemo(() =>
    recentlyViewedIds.map(id => streamers.find(s => s.id === id)).filter(Boolean) as Stock[],
    [recentlyViewedIds, streamers]);

  /** 거래량 기준 상위 5개 종목 / Top 5 stocks by trading volume */
  const top5 = useMemo(() =>
    [...streamers].sort((a, b) => b.totalVolume - a.totalVolume).slice(0, 5),
    [streamers]);

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* 상단 티커 / Top ticker */}
      <Ticker streamers={streamers} liveTrades={liveTrades} />

      {/* 최신 확성기 배너 (게시물이 있을 때만 표시) / Latest megaphone banner (shown only when available) */}
      {latestMegaphone && (
        <a
          href={latestMegaphone.liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 shrink-0 transition-opacity hover:opacity-80"
          style={{ background: '#0D1A10', borderBottom: '1px solid #00E67633', textDecoration: 'none' }}
        >
          <span className="text-sm shrink-0">📣</span>
          <span className="text-xs font-bold shrink-0" style={{ color: '#00E676' }}>
            {latestMegaphone.streamerName}
          </span>
          <span className="text-[10px] font-bold px-1 py-0.5 rounded shrink-0"
            style={{ background: '#FF4444', color: '#FFF' }}>LIVE</span>
          {latestMegaphone.message && (
            <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              {latestMegaphone.message}
            </span>
          )}
          <span className="ml-auto text-[10px] shrink-0" style={{ color: 'var(--text-dim)' }}>
            라이브 보기 →
          </span>
        </a>
      )}

      <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar touch-pan-y">

        {/* 내 투자 요약 / My investment summary */}
        <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid #222A3A' }}>
          <p className="text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>내 투자</p>
          {user ? (
            <>
              <button type="button" onClick={() => onNavigate('profile')}
                className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-white">{fmt(totalAssets)}</span>
                <span className="text-base" style={{ color: 'var(--text-dim)' }}>›</span>
              </button>
              <p className="text-sm font-bold mt-1" style={{ color: priceColor(totalReturnPct) }}>
                {totalReturn >= 0 ? '+' : ''}{fmt(totalReturn)}&nbsp;
                ({totalReturnPct >= 0 ? '+' : ''}{totalReturnPct.toFixed(2)}%)
              </p>
              <div className="mt-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: userGrade.color + '26', color: userGrade.color }}>
                  {userGrade.label}
                </span>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => onNavigate('profile')}
              className="text-lg font-bold mt-1 flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
              로그인 후 확인 가능 ›
            </button>
          )}
        </div>

        {/* 나의 종목 / My stocks */}
        <div className="px-4 pt-4 pb-2" style={{ borderBottom: '1px solid #222A3A' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-white">나의 종목</p>
            {user && <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{holdingCount}개 보유</span>}
          </div>
          {user && holdings.length > 0 ? (
            <>
              <div className="space-y-3 mb-3 max-h-[188px] overflow-y-auto pr-1 hide-scrollbar touch-pan-y">
                {holdings.map(({ streamer: s, qty, value, pct }) => (
                  <div key={s.id} className="flex items-center gap-3 cursor-pointer"
                    onClick={() => onSelect(s)}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black overflow-hidden"
                      style={{ backgroundColor: s.profileImageUrl ? 'transparent' : avatarColor(s.name) }}>
                      {s.profileImageUrl ? (
                        <img src={s.profileImageUrl} alt={s.name} className="w-full h-full object-cover" />
                      ) : s.name.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-bold truncate">{s.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{qty}주</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold text-sm text-white">{fmt(value)}</p>
                      <p className="text-xs font-bold mt-0.5" style={{ color: priceColor(pct) }}>
                        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => onNavigate('holdings')}
                className="w-full py-2 rounded-xl text-xs font-bold"
                style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
                자세히 보기 ›
              </button>
            </>
          ) : (
            <p className="text-sm py-2" style={{ color: 'var(--text-dim)' }}>
              {user ? '보유 종목이 없습니다. 첫 거래를 시작하세요.' : '로그인 후 확인 가능'}
            </p>
          )}
        </div>

        {/* 거래 현황 요약 rows / Trading summary stat rows */}
        <div style={{ borderBottom: '1px solid #222A3A' }}>
          {([
            { label: '주문내역', value: `총 ${history.length}건`, sub: '자세히', action: () => setShowOrderHistory(true) },
            { label: '포트폴리오수익', value: totalReturn >= 0 ? `+${fmt(totalReturn)}` : fmt(totalReturn), sub: `${totalReturnPct.toFixed(2)}%` },
            { label: '동접자', value: `${displayedOnlineCount.toLocaleString()}명`, sub: '실시간' },
          ] as { label: string; value: string; sub: string; action?: () => void }[]).map(row => (
            <div key={row.label} className={`flex items-center px-4 py-3.5${row.action ? ' cursor-pointer' : ''}`}
              style={{ borderBottom: '1px solid #1A2232' }}
              onClick={row.action}>
              <span className="flex-1 text-sm" style={{ color: 'var(--text-muted)' }}>{row.label}</span>
              <span className="text-sm font-bold font-mono text-white mr-1">{row.value}</span>
              {row.sub && <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{row.sub}</span>}
              <span className="ml-2 text-xs" style={{ color: 'var(--text-dim)' }}>›</span>
            </div>
          ))}
        </div>

        {/* 최근 본 종목 (가로 스크롤 칩) / Recently viewed stocks (horizontal scroll chips) */}
        {recentlyViewed.length > 0 && (
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #222A3A' }}>
            <p className="text-sm font-bold text-white mb-3">최근 본 종목</p>
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
              {recentlyViewed.map(s => {
                const pct = changePct(s.price, s.basePrice);
                return (
                  <div key={s.id} className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full border"
                    style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
                    <button type="button" onClick={() => onSelect(s)}
                      className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">{s.name}</span>
                      <span className="text-xs font-bold font-mono" style={{ color: priceColor(pct) }}>
                        {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                      </span>
                    </button>
                    {/* 최근 본 종목 제거 버튼 / Remove from recently viewed */}
                    <button type="button" onClick={() => onRemoveRecent(s.id)}
                      className="text-xs ml-0.5" style={{ color: 'var(--text-dim)' }}>×</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 실시간 거래 피드 (최근 10건, 스크롤 가능) / Live trade feed (most recent 10, scrollable) */}
        <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #222A3A' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-white">실시간 거래 피드</p>
              <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: '#00E67626', color: '#00E676' }}>
                <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: '#00E676' }}></span>
                LIVE
              </span>
            </div>
            {liveTrades.length > 0 && (
              <button type="button" onClick={() => setShowTradeFeed(true)}
                className="text-xs" style={{ color: 'var(--text-dim)' }}>
                더보기 ›
              </button>
            )}
          </div>
          <div className="max-h-[200px] overflow-y-auto hide-scrollbar space-y-2.5 touch-pan-y">
            {liveTrades.length === 0 ? (
              <p className="text-xs py-2" style={{ color: 'var(--text-dim)' }}>
                대기 중... (시스템 내 거래가 실시간으로 표시됩니다)
              </p>
            ) : (
              liveTrades.slice(0, 10).map((trade, idx) => {
                const isBuy = trade.type === 'buy';
                const stock = streamers.find(s => s.id === trade.streamerId);
                return (
                  <div key={idx}
                    className={`flex items-center justify-between text-xs py-1 rounded${stock ? ' cursor-pointer hover:bg-white/5 -mx-1 px-1' : ''}`}
                    onClick={() => { if (stock) onSelect(stock); }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold truncate text-white" style={{ maxWidth: '100px' }}>
                        {trade.streamerName}
                      </span>
                      <span className="px-1 py-0.5 rounded text-[10px] font-bold shrink-0"
                        style={{ backgroundColor: isBuy ? '#FF525220' : '#3D8BFF20', color: isBuy ? '#FF5252' : '#3D8BFF' }}>
                        {isBuy ? '매수' : '매도'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{trade.quantity}주</span>
                      <span className="font-mono font-bold w-16 text-right" style={{ color: isBuy ? '#FF5252' : '#3D8BFF' }}>
                        {fmt(trade.price)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 실시간 거래량 차트 (상위 5개 종목) / Real-time volume chart (top 5 stocks) */}
        <div className="px-4 pt-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-white">실시간 거래량 차트</p>
            <button type="button" onClick={() => onNavigate('chart')}
              className="text-xs" style={{ color: 'var(--text-dim)' }}>
              다른 차트 보기 ›
            </button>
          </div>
          <div className="space-y-1">
            {top5.map((s, i) => {
              const pct = changePct(s.price, s.basePrice);
              return (
                <div key={s.id} className="flex items-center gap-3 py-3 cursor-pointer"
                  style={{ borderBottom: i < top5.length - 1 ? '1px solid #1A2232' : 'none' }}
                  onClick={() => onSelect(s)}>
                  {/* 순위 번호 / Rank number */}
                  <span className="w-5 text-sm font-bold shrink-0 text-center"
                    style={{ color: i < 3 ? 'var(--text-secondary)' : 'var(--text-dim)' }}>{i + 1}</span>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black overflow-hidden"
                    style={{ backgroundColor: s.profileImageUrl ? 'transparent' : avatarColor(s.name) }}>
                    {s.profileImageUrl ? (
                      <img src={s.profileImageUrl} alt={s.name} className="w-full h-full object-cover" />
                    ) : s.name.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-bold truncate">{s.name}</p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>{fmt(s.price)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold" style={{ color: priceColor(pct) }}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                      {fmtCompact(s.totalVolume)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* 전체 거래 피드 모달 / Full trade feed modal */}
      {showTradeFeed && (
        <div className="absolute inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-app)' }}>
          <div className="flex items-center justify-between px-4 py-4 shrink-0"
            style={{ borderBottom: '1px solid #222A3A' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-bold text-base">실시간 거래 피드</h2>
              <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: '#00E67626', color: '#00E676' }}>
                <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: '#00E676' }}></span>
                LIVE
              </span>
            </div>
            <button type="button" onClick={() => setShowTradeFeed(false)}
              className="text-sm px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
              닫기
            </button>
          </div>
          <div className="flex-1 overflow-y-auto hide-scrollbar pb-24 touch-pan-y">
            {liveTrades.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--text-dim)' }}>
                대기 중... (시스템 내 거래가 실시간으로 표시됩니다)
              </div>
            ) : (
              liveTrades.map((trade, idx) => {
                const isBuy = trade.type === 'buy';
                const d = new Date(trade.timestamp);
                const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                const stock = streamers.find(s => s.id === trade.streamerId);
                return (
                  <div key={idx}
                    className={`flex items-center px-4 py-3.5${stock ? ' cursor-pointer hover:bg-white/5' : ''}`}
                    style={{ borderBottom: '1px solid #1A2232' }}
                    onClick={() => { if (stock) { setShowTradeFeed(false); onSelect(stock); } }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            background: isBuy ? '#FF525226' : '#3D8BFF26',
                            color: isBuy ? '#FF5252' : '#3D8BFF',
                          }}>
                          {isBuy ? '매수' : '매도'}
                        </span>
                        <p className="text-white text-sm font-bold truncate">{trade.streamerName}</p>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{timeStr}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold text-sm text-white">{trade.quantity}주</p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: isBuy ? '#FF5252' : '#3D8BFF' }}>
                        {fmt(trade.price)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 주문내역 모달 (전체 화면 오버레이) / Order history modal (full-screen overlay) */}
      {showOrderHistory && (
        <div className="absolute inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-app)' }}>
          <div className="flex items-center justify-between px-4 py-4 shrink-0"
            style={{ borderBottom: '1px solid #222A3A' }}>
            <h2 className="text-white font-bold text-base">주문내역 ({history.length}건)</h2>
            <button type="button" onClick={() => setShowOrderHistory(false)}
              className="text-sm px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
              닫기
            </button>
          </div>
          <div className="flex-1 overflow-y-auto hide-scrollbar pb-24 touch-pan-y">
            {history.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--text-dim)' }}>
                주문 내역이 없습니다
              </div>
            ) : (
              history.map((item: any) => {
                const s = streamers.find(st => st.id === item.streamerId);
                const price = item.executedPrice ?? item.estimatedPrice;
                const d = new Date(item.createdAt);
                const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                return (
                  <div key={item.id} className="flex items-center px-4 py-3.5"
                    style={{ borderBottom: '1px solid #1A2232' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {/* 매수/매도 뱃지 / Buy/sell badge */}
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: item.type === 'buy' ? '#FF525226' : '#3D8BFF26',
                            color: item.type === 'buy' ? '#FF5252' : '#3D8BFF',
                          }}>
                          {item.type === 'buy' ? '매수' : '매도'}
                        </span>
                        <p className="text-white text-sm font-bold truncate">{s?.name ?? item.streamerId}</p>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{timeStr} · {item.status}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold text-sm text-white">{item.quantity}주</p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{fmt(price)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
