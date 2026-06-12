import { useState, useMemo } from 'react';
import { User } from 'firebase/auth';
import { Stock } from '@/hooks/useStocks';
import { AppTab, LiveTrade } from '@/types';
import { fmtCompact, fmtKorean, fmtShares, changePct, priceColor, avatarColor, grade, fmtPct } from '@/utils';
import { Ticker } from '../Ticker';
import { useVisibleMegaphonePosts } from '@/hooks/useMegaphone';
import { useHoldings } from '@/hooks/useHoldings';
import { MegaphonePostList } from '../common/MegaphonePostList';

const formatFeedTime = (value: number | string | null | undefined): string => {
  if (value == null) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/** Home screen component.
 *  Renders the ticker, recent megaphone posts, investment summary,
 *  holdings (up to 3), stat rows, recently viewed, live trade feed,
 *  and volume chart */
export const HomeView = ({
  streamers, portfolio, user, totalAssets, history, recentlyViewedIds,
  onlineCount, onSelect, onNavigate, onRemoveRecent, liveTrades,
}: {
  /** Full list of stocks */
  streamers: Stock[];
  /** Portfolio data */
  portfolio: any;
  /** Authenticated user */
  user: User | null;
  /** Total assets (cash + stock market value) */
  totalAssets: number;
  /** Order and transaction history list */
  history: any[];
  /** Recently viewed stock IDs in recency order */
  recentlyViewedIds: string[];
  /** Current online connection count */
  onlineCount: number | null;
  /** Stock selection handler */
  onSelect: (s: Stock) => void;
  /** Tab navigation handler */
  onNavigate: (tab: AppTab) => void;
  /** Handler to remove a stock from recently viewed */
  onRemoveRecent: (id: string) => void;
  /** Live trade events */
  liveTrades: LiveTrade[];
}) => {
  /** Whether the order history modal is visible */
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  /** Whether the full trade feed modal is visible */
  const [showTradeFeed, setShowTradeFeed] = useState(false);

  const megaphonePosts = useVisibleMegaphonePosts();
  const userGrade = portfolio?.leagueRank != null
    ? grade(portfolio.leagueRank, portfolio.leagueTotal)
    : null;
  const displayedOnlineCount = onlineCount ?? 0;

  /** Holdings sorted by value descending */
  const { holdings, holdingCount } = useHoldings(portfolio, streamers);
  /** Total market value of current holdings */
  const holdingsValue = holdings.reduce((sum, h) => sum + h.value, 0);
  /** Total cost basis of current holdings */
  const holdingsCost = holdings.reduce((sum, h) => sum + h.avgPrice * h.qty, 0);
  /** Total P&L relative to cost basis */
  const holdingsPnL = holdingsValue - holdingsCost;
  /** Total return rate relative to cost basis */
  const holdingsPnLPct = holdingsCost > 0 ? (holdingsPnL / holdingsCost) * 100 : 0;

  /** Recently viewed Stock objects in recency order */
  const recentlyViewed = useMemo(() =>
    recentlyViewedIds.map(id => streamers.find(s => s.id === id)).filter(Boolean) as Stock[],
    [recentlyViewedIds, streamers]);

  /** Top 5 stocks by trading volume */
  const top5 = useMemo(() =>
    [...streamers].sort((a, b) => b.totalVolume - a.totalVolume).slice(0, 5),
    [streamers]);
  const sectionBorder = '1px solid var(--border-primary)';
  const rowBorder = '1px solid var(--border-card)';

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* Top ticker */}
      <Ticker streamers={streamers} liveTrades={liveTrades} />

      <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar touch-pan-y">

        {/* Recent megaphone posts */}
        <div className="px-4 pt-4 pb-3" style={{ borderBottom: sectionBorder }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-bold text-white">최근 확성기</p>
            <button
              type="button"
              onClick={() => onNavigate('shop')}
              className="text-xs shrink-0"
              style={{ color: 'var(--text-dim)' }}
            >
              상점 보기 →
            </button>
          </div>
          <MegaphonePostList posts={megaphonePosts} compact limit={3} />
        </div>

        {/* My investment summary */}
        <div className="px-4 pt-5 pb-4" style={{ borderBottom: sectionBorder }}>
          <p className="text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>내 투자</p>
          {user ? (
            <>
              <button type="button" onClick={() => onNavigate('profile')}
                className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-white">{fmtKorean(totalAssets)}</span>
                <span className="text-base" style={{ color: 'var(--text-dim)' }}>›</span>
              </button>
              <p className="text-sm font-bold mt-1 whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: priceColor(holdingsPnLPct) }}>
                {holdingsPnL >= 0 ? '+' : ''}{fmtKorean(holdingsPnL)}&nbsp;
                ({fmtPct(holdingsPnLPct)})
                <span className="ml-1 font-normal" style={{ color: 'var(--text-dim)' }}>매입 대비</span>
              </p>
              {userGrade && (
                <div className="mt-2">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: userGrade.color + '26', color: userGrade.color }}>
                    {userGrade.label}
                  </span>
                </div>
              )}
            </>
          ) : (
            <button type="button" onClick={() => onNavigate('profile')}
              className="text-lg font-bold mt-1 flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
              로그인 후 확인 가능 ›
            </button>
          )}
        </div>

        {/* My stocks */}
        <div className="px-4 pt-4 pb-2" style={{ borderBottom: sectionBorder }}>
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
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{fmtShares(qty)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold text-sm text-white">{fmtKorean(value)}</p>
                      <p className="text-xs font-bold mt-0.5 whitespace-nowrap" style={{ color: priceColor(pct) }}>
                        {fmtPct(pct)}
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

        {/* Trading summary stat rows */}
        <div style={{ borderBottom: sectionBorder }}>
          {([
            { label: '주문내역', value: `총 ${history.length}건`, sub: '자세히', action: () => setShowOrderHistory(true) },
            { label: '포트폴리오수익', value: holdingsPnL >= 0 ? `+${fmtKorean(holdingsPnL)}` : fmtKorean(holdingsPnL), sub: fmtPct(holdingsPnLPct) },
            { label: '동접자', value: `${displayedOnlineCount.toLocaleString()}명`, sub: '실시간' },
          ] as { label: string; value: string; sub: string; action?: () => void }[]).map(row => (
            <div key={row.label} className={`flex items-center px-4 py-3.5${row.action ? ' cursor-pointer' : ''}`}
              style={{ borderBottom: rowBorder }}
              onClick={row.action}>
              <span className="flex-1 text-sm" style={{ color: 'var(--text-muted)' }}>{row.label}</span>
              <span className="text-sm font-bold font-mono text-white mr-1 min-w-0 truncate">{row.value}</span>
              {row.sub && <span className="text-xs shrink-0 whitespace-nowrap" style={{ color: 'var(--text-dim)' }}>{row.sub}</span>}
              <span className="ml-2 text-xs" style={{ color: 'var(--text-dim)' }}>›</span>
            </div>
          ))}
        </div>

        {/* Recently viewed stocks (horizontal scroll chips) */}
        {recentlyViewed.length > 0 && (
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: sectionBorder }}>
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
                      <span className="text-xs font-bold font-mono shrink-0 whitespace-nowrap" style={{ color: priceColor(pct) }}>
                        {fmtPct(pct, 1)}
                      </span>
                    </button>
                    {/* Remove from recently viewed */}
                    <button type="button" onClick={() => onRemoveRecent(s.id)}
                      className="text-xs ml-0.5" style={{ color: 'var(--text-dim)' }}>×</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Live trade feed (most recent 10, scrollable) */}
        <div className="px-4 pt-4 pb-3 min-w-0 overflow-hidden" style={{ borderBottom: sectionBorder }}>
          <div className="flex items-center justify-between gap-3 mb-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-bold text-white">실시간 거래 피드</p>
              <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent)' }}></span>
                LIVE
              </span>
            </div>
            {liveTrades.length > 0 && (
              <button type="button" onClick={() => setShowTradeFeed(true)}
                className="text-xs shrink-0" style={{ color: 'var(--text-dim)' }}>
                더보기 ›
              </button>
            )}
          </div>
          <div className="max-h-[200px] overflow-y-auto overflow-x-hidden hide-scrollbar space-y-2.5 touch-pan-y">
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
                    className={`flex items-center justify-between gap-2 w-full min-w-0 text-xs py-1 rounded${stock ? ' cursor-pointer hover:bg-white/5 px-1' : ''}`}
                    onClick={() => { if (stock) onSelect(stock); }}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-bold truncate text-white min-w-0">
                        {trade.streamerName}
                      </span>
                      <span className="px-1 py-0.5 rounded text-[10px] font-bold shrink-0"
                        style={{ backgroundColor: isBuy ? '#FF525220' : '#3D8BFF20', color: isBuy ? '#FF5252' : '#3D8BFF' }}>
                        {isBuy ? '매수' : '매도'}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-2 shrink-0 min-w-0 max-w-[55%]">
                      <span className="font-mono truncate min-w-0" style={{ color: 'var(--text-secondary)' }}>{fmtShares(trade.quantity)}</span>
                      <span className="font-mono font-bold w-16 max-w-16 text-right shrink-0 truncate" style={{ color: isBuy ? '#FF5252' : '#3D8BFF' }}>
                        {fmtKorean(trade.price)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Real-time volume chart (top 5 stocks) */}
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
                  style={{ borderBottom: i < top5.length - 1 ? rowBorder : 'none' }}
                  onClick={() => onSelect(s)}>
                  {/* Rank number */}
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
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>{fmtKorean(s.price)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold whitespace-nowrap" style={{ color: priceColor(pct) }}>
                      {fmtPct(pct)}
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

      {/* Full trade feed modal */}
      {showTradeFeed && (
        <div className="absolute inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-app)' }}>
          <div className="flex items-center justify-between px-4 py-4 shrink-0"
            style={{ borderBottom: sectionBorder }}>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-bold text-base">실시간 거래 피드</h2>
              <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent)' }}></span>
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
                const timeStr = formatFeedTime(trade.timestamp);
                const stock = streamers.find(s => s.id === trade.streamerId);
                return (
                  <div key={idx}
                    className={`flex items-center px-4 py-3.5${stock ? ' cursor-pointer hover:bg-white/5' : ''}`}
                    style={{ borderBottom: rowBorder }}
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
                      <p className="font-mono font-bold text-sm text-white">{fmtShares(trade.quantity)}</p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: isBuy ? '#FF5252' : '#3D8BFF' }}>
                        {fmtKorean(trade.price)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Order history modal (full-screen overlay) */}
      {showOrderHistory && (
        <div className="absolute inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-app)' }}>
          <div className="flex items-center justify-between px-4 py-4 shrink-0"
            style={{ borderBottom: sectionBorder }}>
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
                const timeStr = formatFeedTime(item.createdAt);
                return (
                  <div key={item.id} className="flex items-center px-4 py-3.5"
                    style={{ borderBottom: rowBorder }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {/* Buy/sell badge */}
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
                      <p className="font-mono font-bold text-sm text-white">{fmtShares(item.quantity)}</p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{fmtKorean(price)}</p>
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
