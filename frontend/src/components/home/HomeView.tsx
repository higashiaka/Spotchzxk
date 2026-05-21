import { useState, useMemo, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { AppTab, LiveTrade } from '../../types';
import { fmt, fmtCompact, changePct, priceColor, avatarColor, INITIAL_BALANCE, grade } from '../../utils';
import { Ticker } from '../Ticker';
import { MegaphonePost, useMegaphonePosts } from '../../hooks/useMegaphone';
import { subscribeStomp } from '../../lib/stompClient';

export const HomeView = ({
  streamers, portfolio, user, totalAssets, history, recentlyViewedIds,
  onSelect, onNavigate, onRemoveRecent, liveTrades,
}: {
  streamers: Stock[];
  portfolio: any;
  user: User | null;
  totalAssets: number;
  history: any[];
  recentlyViewedIds: string[];
  onSelect: (s: Stock) => void;
  onNavigate: (tab: AppTab) => void;
  onRemoveRecent: (id: string) => void;
  liveTrades: LiveTrade[];
}) => {
  const [showOrderHistory, setShowOrderHistory] = useState(false);

  const { data: initialPosts = [] } = useMegaphonePosts();
  const [latestMegaphone, setLatestMegaphone] = useState<MegaphonePost | null>(null);

  useEffect(() => {
    if (initialPosts.length > 0) setLatestMegaphone(initialPosts[0]);
  }, [initialPosts]);

  useEffect(() => {
    const sub = subscribeStomp('/topic/megaphone', msg => {
      try { setLatestMegaphone(JSON.parse(msg.body) as MegaphonePost); } catch { /* ignore */ }
    });
    return () => sub.unsubscribe();
  }, []);
  const totalReturn = totalAssets - INITIAL_BALANCE;
  const totalReturnPct = (totalReturn / INITIAL_BALANCE) * 100;
  const userGrade = grade(totalAssets);

  const holdings = useMemo(() => {
    if (!portfolio?.shares) return [];
    return Object.entries(portfolio.shares as Record<string, number>)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const s = streamers.find(st => st.id === id);
        if (!s) return null;
        const avgPrice = portfolio.avgPrices?.[id] ?? 0;
        const profitRate = avgPrice > 0 ? ((s.price - avgPrice) / avgPrice) * 100 : 0;
        return { streamer: s, qty, value: s.price * qty, pct: profitRate, avgPrice };
      })
      .filter(Boolean)
      .sort((a, b) => b!.value - a!.value)
      .slice(0, 3) as { streamer: Stock; qty: number; value: number; pct: number; avgPrice: number }[];
  }, [portfolio, streamers]);

  const holdingCount = useMemo(() =>
    Object.values(portfolio?.shares as Record<string, number> ?? {}).filter(q => q > 0).length,
    [portfolio]);

  const recentlyViewed = useMemo(() =>
    recentlyViewedIds.map(id => streamers.find(s => s.id === id)).filter(Boolean) as Stock[],
    [recentlyViewedIds, streamers]);

  const top5 = useMemo(() =>
    [...streamers].sort((a, b) => b.totalVolume - a.totalVolume).slice(0, 5),
    [streamers]);

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      <Ticker streamers={streamers} liveTrades={liveTrades} />

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
            <span className="text-xs truncate" style={{ color: '#8899AA' }}>
              {latestMegaphone.message}
            </span>
          )}
          <span className="ml-auto text-[10px] shrink-0" style={{ color: '#626B7A' }}>
            라이브 보기 →
          </span>
        </a>
      )}

      <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar">

        {/* 내 투자 */}
        <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid #222A3A' }}>
          <p className="text-xs font-bold mb-1" style={{ color: '#8491A5' }}>내 투자</p>
          {user ? (
            <>
              <button type="button" onClick={() => onNavigate('profile')}
                className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-white">{fmt(totalAssets)}</span>
                <span className="text-base" style={{ color: '#626B7A' }}>›</span>
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
              className="text-lg font-bold mt-1 flex items-center gap-1" style={{ color: '#626B7A' }}>
              로그인 후 확인 가능 ›
            </button>
          )}
        </div>

        {/* 나의 종목 */}
        <div className="px-4 pt-4 pb-2" style={{ borderBottom: '1px solid #222A3A' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-white">나의 종목</p>
            {user && <span className="text-xs" style={{ color: '#626B7A' }}>{holdingCount}개 보유</span>}
          </div>
          {user && holdings.length > 0 ? (
            <>
              <div className="space-y-3 mb-3">
                {holdings.map(({ streamer: s, qty, value, pct }) => (
                  <div key={s.id} className="flex items-center gap-3 cursor-pointer"
                    onClick={() => { onSelect(s); onNavigate('prices'); }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black overflow-hidden"
                      style={{ backgroundColor: s.profileImageUrl ? 'transparent' : avatarColor(s.name) }}>
                      {s.profileImageUrl ? (
                        <img src={s.profileImageUrl} alt={s.name} className="w-full h-full object-cover" />
                      ) : (
                        s.name.slice(0, 2)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-bold truncate">{s.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#626B7A' }}>{qty}주</p>
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
              <button type="button" onClick={() => onNavigate('profile')}
                className="w-full py-2 rounded-xl text-xs font-bold"
                style={{ background: '#1A2232', color: '#BAC4D1' }}>
                자세히 보기 ›
              </button>
            </>
          ) : (
            <p className="text-sm py-2" style={{ color: '#626B7A' }}>
              {user ? '보유 종목이 없습니다. 첫 거래를 시작하세요.' : '로그인 후 확인 가능'}
            </p>
          )}
        </div>

        {/* 거래 현황 rows */}
        <div style={{ borderBottom: '1px solid #222A3A' }}>
          {([
            { label: '주문내역', value: `총 ${history.length}건`, sub: '자세히', action: () => setShowOrderHistory(true) },
            { label: '보유 종목', value: `${holdingCount}개`, sub: '' },
            { label: '포트폴리오 수익', value: totalReturn >= 0 ? `+${fmt(totalReturn)}` : fmt(totalReturn), sub: `${totalReturnPct.toFixed(2)}%` },
          ] as { label: string; value: string; sub: string; action?: () => void }[]).map(row => (
            <div key={row.label} className={`flex items-center px-4 py-3.5${row.action ? ' cursor-pointer' : ''}`}
              style={{ borderBottom: '1px solid #1A2232' }}
              onClick={row.action}>
              <span className="flex-1 text-sm" style={{ color: '#8491A5' }}>{row.label}</span>
              <span className="text-sm font-bold font-mono text-white mr-1">{row.value}</span>
              {row.sub && <span className="text-xs" style={{ color: '#626B7A' }}>{row.sub}</span>}
              <span className="ml-2 text-xs" style={{ color: '#626B7A' }}>›</span>
            </div>
          ))}
        </div>

        {/* 최근 본 종목 */}
        {recentlyViewed.length > 0 && (
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #222A3A' }}>
            <p className="text-sm font-bold text-white mb-3">최근 본 종목</p>
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
              {recentlyViewed.map(s => {
                const pct = changePct(s.price, s.basePrice);
                return (
                  <div key={s.id} className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full border"
                    style={{ background: '#131924', borderColor: '#222A3A' }}>
                    <button type="button" onClick={() => { onSelect(s); onNavigate('prices'); }}
                      className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">{s.name}</span>
                      <span className="text-xs font-bold font-mono" style={{ color: priceColor(pct) }}>
                        {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                      </span>
                    </button>
                    <button type="button" onClick={() => onRemoveRecent(s.id)}
                      className="text-xs ml-0.5" style={{ color: '#626B7A' }}>×</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 실시간 거래 피드 */}
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
          </div>
          <div className="space-y-2.5">
            {liveTrades.length === 0 ? (
              <p className="text-xs py-2" style={{ color: '#626B7A' }}>
                대기 중... (시스템 내 거래가 실시간으로 표시됩니다)
              </p>
            ) : (
              liveTrades.slice(0, 3).map((trade, idx) => {
                const isBuy = trade.type === 'buy';
                return (
                  <div key={idx} className="flex items-center justify-between text-xs py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold truncate text-white" style={{ maxWidth: '100px' }}>
                        {trade.streamerName}
                      </span>
                      <span className="px-1 py-0.5 rounded text-[10px] font-bold shrink-0"
                        style={{
                          backgroundColor: isBuy ? '#FF525220' : '#3D8BFF20',
                          color: isBuy ? '#FF5252' : '#3D8BFF'
                        }}>
                        {isBuy ? '매수' : '매도'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono" style={{ color: '#BAC4D1' }}>{trade.quantity}주</span>
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

        {/* 실시간 거래량 차트 */}
        <div className="px-4 pt-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-white">실시간 거래량 차트</p>
            <button type="button" onClick={() => onNavigate('chart')}
              className="text-xs" style={{ color: '#626B7A' }}>
              다른 차트 보기 ›
            </button>
          </div>
          <div className="space-y-1">
            {top5.map((s, i) => {
              const pct = changePct(s.price);
              return (
                <div key={s.id} className="flex items-center gap-3 py-3 cursor-pointer"
                  style={{ borderBottom: i < top5.length - 1 ? '1px solid #1A2232' : 'none' }}
                  onClick={() => { onSelect(s); onNavigate('prices'); }}>
                  <span className="w-5 text-sm font-bold shrink-0 text-center"
                    style={{ color: i < 3 ? '#BAC4D1' : '#626B7A' }}>{i + 1}</span>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black overflow-hidden"
                    style={{ backgroundColor: s.profileImageUrl ? 'transparent' : avatarColor(s.name) }}>
                    {s.profileImageUrl ? (
                      <img src={s.profileImageUrl} alt={s.name} className="w-full h-full object-cover" />
                    ) : (
                      s.name.slice(0, 2)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-bold truncate">{s.name}</p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: '#626B7A' }}>
                      {fmt(s.price)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold" style={{ color: priceColor(pct) }}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#626B7A' }}>
                      {fmtCompact(s.totalVolume)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* 주문내역 모달 */}
      {showOrderHistory && (
        <div className="absolute inset-0 z-50 flex flex-col" style={{ background: '#080A0F' }}>
          <div className="flex items-center justify-between px-4 py-4 shrink-0"
            style={{ borderBottom: '1px solid #222A3A' }}>
            <h2 className="text-white font-bold text-base">주문내역 ({history.length}건)</h2>
            <button type="button" onClick={() => setShowOrderHistory(false)}
              className="text-sm px-3 py-1.5 rounded-lg"
              style={{ background: '#1A2232', color: '#BAC4D1' }}>
              닫기
            </button>
          </div>
          <div className="flex-1 overflow-y-auto hide-scrollbar pb-24">
            {history.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#626B7A' }}>
                주문 내역이 없습니다
              </div>
            ) : (
              [...history].reverse().map((item: any) => {
                const s = streamers.find(st => st.id === item.streamerId);
                const price = item.executedPrice ?? item.estimatedPrice;
                const d = new Date(item.createdAt);
                const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                return (
                  <div key={item.id} className="flex items-center px-4 py-3.5"
                    style={{ borderBottom: '1px solid #1A2232' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: item.type === 'buy' ? '#FF525226' : '#3D8BFF26',
                            color: item.type === 'buy' ? '#FF5252' : '#3D8BFF',
                          }}>
                          {item.type === 'buy' ? '매수' : '매도'}
                        </span>
                        <p className="text-white text-sm font-bold truncate">{s?.name ?? item.streamerId}</p>
                      </div>
                      <p className="text-xs" style={{ color: '#626B7A' }}>{timeStr} · {item.status}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold text-sm text-white">{item.quantity}주</p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: '#8491A5' }}>{fmt(price)}</p>
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
