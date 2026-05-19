import { useState, useMemo, useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useStockPrice } from './hooks/useStockPrice';
import { useTrade } from './hooks/useTrade';
import { usePortfolio } from './hooks/usePortfolio';
import { useTransactionHistory } from './hooks/useTransactionHistory';
import { useStocks, Stock, DEFAULT_STOCKS } from './hooks/useStocks';
import { useResetPortfolio } from './hooks/useResetPortfolio';
import { auth, googleProvider } from './firebase';
import {
  signInWithPopup, signOut, onAuthStateChanged,
  User, signInAnonymously, signInWithCustomToken, updateProfile,
  linkWithPopup, signInWithCredential,
} from 'firebase/auth';
import { subscribeStomp } from './lib/stompClient';
import { apiFetch } from './lib/api';

// ─── 타입 ────────────────────────────────────────────────────────────────────
type AppTab = 'home' | 'prices' | 'order' | 'chart' | 'profile';

interface LiveTrade {
  streamerId: string;
  streamerName: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: number;
}

// ─── 상수 ────────────────────────────────────────────────────────────────────
const BASE_PRICE = 1000;
const INITIAL_BALANCE = 10_000_000;

// ─── 유틸 ────────────────────────────────────────────────────────────────────
const fmt = (value: number): string => {
  if (value < 1) return `${value.toFixed(2)}원`;
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
};

const fmtCompact = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};

const changePct = (price: number, basePrice: number = BASE_PRICE) => ((price - basePrice) / basePrice) * 100;

const grade = (assets: number): { label: string; color: string } => {
  if (assets >= 30_000_000) return { label: '다이아 리그', color: '#00BCD4' };
  if (assets >= 15_000_000) return { label: '플래티넘 리그', color: '#C0C0C0' };
  if (assets >= 12_000_000) return { label: '골드 리그', color: '#FFD700' };
  if (assets >= 10_000_000) return { label: '실버 리그', color: '#A8A8A8' };
  return { label: '브론즈 리그', color: '#CD7F32' };
};

// 상승=빨강 / 하락=파랑 / 보합=회색 (한국 증시 관례)
const priceColor = (pct: number) => pct > 0 ? '#FF5252' : pct < 0 ? '#3D8BFF' : '#888888';

// 종목 이름 기반 아바타 색상 (일관된 해시)
const AVATAR_COLORS = ['#FF5252', '#3D8BFF', '#00E676', '#FFD700', '#FF9800', '#AB47BC', '#00BCD4', '#F06292'];
const avatarColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};



// ─── Ticker ───────────────────────────────────────────────────────────────────
const Ticker = ({ streamers, liveTrades }: { streamers: Stock[]; liveTrades: LiveTrade[] }) => {
  const items = useMemo(() => {
    // 최근 체결 순서대로 unique streamer ID 최대 30개 추출
    const recentIds: string[] = [];
    const seen = new Set<string>();
    for (const t of liveTrades) {
      if (!seen.has(t.streamerId)) {
        seen.add(t.streamerId);
        recentIds.push(t.streamerId);
        if (recentIds.length === 30) break;
      }
    }

    let list: Stock[];
    if (recentIds.length >= 6) {
      // 최근 체결된 종목 순서 유지
      list = recentIds.map(id => streamers.find(s => s.id === id)).filter(Boolean) as Stock[];
    } else {
      // 체결 데이터 부족 시 거래량 상위 20개 fallback
      const active = streamers.filter(s => s.totalVolume > 0);
      list = (active.length >= 6 ? active : streamers.slice(0, 20))
        .sort((a, b) => Math.abs(changePct(b.price, b.basePrice)) - Math.abs(changePct(a.price, a.basePrice)));
    }

    return [...list, ...list]; // 무한 루프를 위해 복제
  }, [streamers, liveTrades]);

  const duration = Math.max(20, (items.length / 2) * 4); // 종목당 4초, 최소 20초

  if (items.length === 0) return null;

  return (
    <div className="relative overflow-hidden shrink-0"
      style={{ background: '#0E121A', borderBottom: '1px solid #222A3A' }}>
      <div className="absolute left-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to right, #0E121A, transparent)' }} />
      <div className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to left, #0E121A, transparent)' }} />
      <div className="flex py-2" style={{ width: 'max-content', animation: `ticker-scroll ${duration}s linear infinite` }}>
        {items.map((s, i) => {
          const pct = changePct(s.price, s.basePrice);
          return (
            <span key={i} className="inline-flex items-center gap-1.5 px-4">
              <span className="text-xs font-bold" style={{ color: '#BAC4D1' }}>{s.name}</span>
              <span className="text-xs font-bold font-mono" style={{ color: priceColor(pct) }}>
                {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
              </span>
              <span className="text-xs" style={{ color: '#26334D' }}>|</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

// ─── HomeView ─────────────────────────────────────────────────────────────────
const HomeView = ({
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
  const totalReturn = totalAssets - INITIAL_BALANCE;
  const totalReturnPct = (totalReturn / INITIAL_BALANCE) * 100;
  const userGrade = grade(totalAssets);

  // 보유 종목 (상위 3개)
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

  // 최근 본 종목 (ID → 현재 가격으로 조회)
  const recentlyViewed = useMemo(() =>
    recentlyViewedIds.map(id => streamers.find(s => s.id === id)).filter(Boolean) as Stock[],
    [recentlyViewedIds, streamers]);

  // 실시간 거래량 상위 5
  const top5 = useMemo(() =>
    [...streamers].sort((a, b) => b.totalVolume - a.totalVolume).slice(0, 5),
    [streamers]);

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* 급등/급락 실시간 티커 — 상단 고정 */}
      <Ticker streamers={streamers} liveTrades={liveTrades} />

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar">

        {/* ── 내 투자 ─────────────────────────────────────────────── */}
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

        {/* ── 나의 종목 ────────────────────────────────────────────── */}
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

        {/* ── 거래 현황 rows ───────────────────────────────────────── */}
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

        {/* ── 최근 본 종목 ─────────────────────────────────────────── */}
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

        {/* ── 실시간 거래 피드 (Global Live Trades) ────────────────────── */}
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

        {/* ── 실시간 거래량 차트 ───────────────────────────────────── */}
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

// ─── 캔들 차트 타입 및 유틸 ────────────────────────────────────────────────────
interface Candle {
  time: UTCTimestamp; // seconds since epoch (lightweight-charts 형식)
  open: number;
  high: number;
  low: number;
  close: number;
}

const formatCandleTime = (time: UTCTimestamp, interval: string): string => {
  const d = new Date(time * 1000);
  if (interval === '1m' || interval === '5m') {
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  } else if (interval === '1h') {
    return `${String(d.getUTCHours()).padStart(2, '0')}:00`;
  } else {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
};

// 시리즈 전체 데이터 세팅
function applySeriesData(
  series: ISeriesApi<'Candlestick'> | ISeriesApi<'Area'>,
  candles: Candle[],
  chartType: 'candle' | 'line',
) {
  if (chartType === 'candle') {
    (series as ISeriesApi<'Candlestick'>).setData(
      candles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
    );
  } else {
    (series as ISeriesApi<'Area'>).setData(candles.map(c => ({ time: c.time, value: c.close })));
  }
}

// 마지막 캔들만 업데이트 (실시간)
function updateSeriesLast(
  series: ISeriesApi<'Candlestick'> | ISeriesApi<'Area'>,
  c: Candle,
  chartType: 'candle' | 'line',
) {
  if (chartType === 'candle') {
    (series as ISeriesApi<'Candlestick'>).update(
      { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close },
    );
  } else {
    (series as ISeriesApi<'Area'>).update({ time: c.time, value: c.close });
  }
}

const InteractiveChart = ({
  candles,
  chartType,
  color,
  interval,
}: {
  candles: Candle[];
  chartType: 'candle' | 'line';
  color: string;
  interval: string;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | null>(null);
  const [active, setActive] = useState<Candle | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const candlesRef = useRef(candles);
  const prevCandlesRef = useRef<Candle[]>([]);

  useEffect(() => { candlesRef.current = candles; }, [candles]);

  // 차트 인스턴스 초기화 (마운트 1회)
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0E121A' },
        textColor: '#626B7A',
        fontFamily: 'monospace',
      },
      grid: {
        vertLines: { color: '#1A2232', style: LineStyle.Dashed },
        horzLines: { color: '#1A2232', style: LineStyle.Dashed },
      },
      rightPriceScale: { borderColor: '#1A2232' },
      timeScale: { borderColor: '#1A2232', timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#3D8BFF', style: LineStyle.Dashed, width: 1 },
        horzLine: { color: '#3D8BFF', style: LineStyle.Dashed, width: 1 },
      },
    });
    chartRef.current = chart;

    chart.subscribeCrosshairMove((param) => {
      const cs = candlesRef.current;
      if (!param.time || cs.length === 0) {
        setIsHovering(false);
        setActive(cs[cs.length - 1] ?? null);
        return;
      }
      setIsHovering(true);
      const found = cs.find(c => c.time === (param.time as UTCTimestamp));
      setActive(found ?? cs[cs.length - 1] ?? null);
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // 차트 타입 변경 시 시리즈 재생성
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) chart.removeSeries(seriesRef.current);

    const lineColor = color === '#FF5252' ? '#FF3B30' : '#007AFF';
    if (chartType === 'candle') {
      seriesRef.current = chart.addCandlestickSeries({
        upColor: '#FF3B30', downColor: '#007AFF',
        borderUpColor: '#FF3B30', borderDownColor: '#007AFF',
        wickUpColor: '#FF3B30', wickDownColor: '#007AFF',
      });
    } else {
      seriesRef.current = chart.addAreaSeries({
        lineColor, topColor: lineColor + '40', bottomColor: lineColor + '00', lineWidth: 2,
      });
    }

    const current = candlesRef.current;
    if (current.length > 0) {
      applySeriesData(seriesRef.current, current, chartType);
      setActive(current[current.length - 1]);
    }
    prevCandlesRef.current = current;
  }, [chartType]); // eslint-disable-line react-hooks/exhaustive-deps

  // 선차트 색상이 상승/하락 방향에 따라 바뀔 때 반영
  useEffect(() => {
    if (!seriesRef.current || chartType !== 'line') return;
    const lineColor = color === '#FF5252' ? '#FF3B30' : '#007AFF';
    (seriesRef.current as ISeriesApi<'Area'>).applyOptions({
      lineColor, topColor: lineColor + '40', bottomColor: lineColor + '00',
    });
  }, [color, chartType]);

  // 캔들 데이터 변경 시 업데이트
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (candles.length === 0) { prevCandlesRef.current = []; return; }

    const prev = prevCandlesRef.current;
    const isIncremental =
      prev.length > 0 &&
      prev[0].time === candles[0].time &&
      candles.length <= prev.length + 1;

    if (isIncremental) {
      updateSeriesLast(series, candles[candles.length - 1], chartType);
    } else {
      applySeriesData(series, candles, chartType);
    }
    prevCandlesRef.current = candles;
    setActive(candles[candles.length - 1]);
  }, [candles]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayActive = active ?? (candles.length > 0 ? candles[candles.length - 1] : null);
  const isUp = displayActive ? displayActive.close >= displayActive.open : true;
  const activeColor = isUp ? '#FF3B30' : '#007AFF';

  return (
    <div className="w-full flex flex-col gap-2 relative select-none">
      {/* ── OHLC Info Bar ── */}
      <div className="flex items-center gap-3 text-[11px] font-mono select-none px-1" style={{ color: '#BAC4D1' }}>
        {displayActive ? (
          <>
            <span className="font-bold font-sans text-xs shrink-0" style={{ color: activeColor }}>
              {isUp ? '▲ 양봉' : '▼ 음봉'}
            </span>
            <div className="flex gap-2.5">
              <span>시<strong className="ml-1 text-[#FF3B30]">{Math.round(displayActive.open).toLocaleString()}</strong></span>
              <span>고<strong className="ml-1 text-[#FF3B30]">{Math.round(displayActive.high).toLocaleString()}</strong></span>
              <span>저<strong className="ml-1 text-[#007AFF]">{Math.round(displayActive.low).toLocaleString()}</strong></span>
              <span>종<strong className="ml-1" style={{ color: activeColor }}>{Math.round(displayActive.close).toLocaleString()}</strong></span>
            </div>
            {isHovering && (
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-[#1A2232] text-[#626B7A]">
                {formatCandleTime(displayActive.time, interval)}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="font-bold font-sans text-xs shrink-0 text-[#626B7A]">○ 대기 중</span>
            <div className="flex gap-2.5" style={{ color: '#4E5664' }}>
              <span>시<strong className="ml-1 text-[#4E5664]">-</strong></span>
              <span>고<strong className="ml-1 text-[#4E5664]">-</strong></span>
              <span>저<strong className="ml-1 text-[#4E5664]">-</strong></span>
              <span>종<strong className="ml-1 text-[#4E5664]">-</strong></span>
            </div>
          </>
        )}
      </div>

      {/* 차트 컨테이너 (항상 렌더링 — empty state는 overlay로 처리) */}
      <div className="h-56 relative w-full">
        <div ref={containerRef} className="w-full h-full rounded-xl border border-[#1A2232] overflow-hidden" />
        {candles.length === 0 && (
          <div className="absolute inset-0 bg-[#0E121A] rounded-xl border border-[#1A2232] flex flex-col items-center justify-center gap-2.5 p-6 text-center">
            <div className="w-11 h-11 rounded-full bg-[#161D28] flex items-center justify-center text-lg text-[#626B7A] border border-[#222A3A] animate-pulse">
              📊
            </div>
            <div>
              <div className="inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-[#00E6761A] text-[#00E676] mb-1">
                신규 상장 종목
              </div>
              <h4 className="text-white text-xs font-bold mb-1">거래 내역이 존재하지 않습니다</h4>
              <p className="text-[10px]" style={{ color: '#626B7A' }}>
                아직 체결된 거래가 없습니다. 실시간으로 매수/매도 주문을<br />
                체결하여 이 종목의 첫 번째 역사적 캔들을 생성해보세요!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── StockDetail (PricesView 내부) ────────────────────────────────────────────
const StockDetail = ({
  streamer, onBack, onOrder, liveTrades,
}: {
  streamer: Stock;
  onBack: () => void;
  onOrder: () => void;
  liveTrades: LiveTrade[];
}) => {
  const { currentPrice, direction } = useStockPrice(streamer.id, streamer.price);
  const [interval, setInterval] = useState<'1m' | '5m' | '1h' | '1d' | '1w'>('5m');
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');
  const [candles, setCandles] = useState<Candle[]>([]);

  // 서버에서 초기 캔들 목록 로드
  useEffect(() => {
    setCandles([]);
    apiFetch(`/api/stocks/${streamer.id}/candles?interval=${interval}&count=50`)
      .then(res => res.ok ? res.json() : [])
      .then((data: { bucketStart: number; open: number; high: number; low: number; close: number }[]) => {
        setCandles(data.map(c => ({
          time: (Math.floor(c.bucketStart / 1000) + 9 * 3600) as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })));
      })
      .catch(() => setCandles([]));
  }, [streamer.id, interval]);

  // 서버 STOMP에서 실시간 캔들 업데이트 수신
  useEffect(() => {
    const subscription = subscribeStomp(`/topic/candles/${streamer.id}`, (message) => {
      try {
        const updates = JSON.parse(message.body) as Record<string, { bucketStart: number; open: number; high: number; low: number; close: number }>;
        const updated = updates[interval];
        if (!updated) return;
        const newCandle: Candle = {
          time: (Math.floor(updated.bucketStart / 1000) + 9 * 3600) as UTCTimestamp,
          open: updated.open,
          high: updated.high,
          low: updated.low,
          close: updated.close,
        };
        setCandles(prev => {
          if (prev.length === 0) return [newCandle];
          const last = prev[prev.length - 1];
          if (last.time === newCandle.time) {
            return [...prev.slice(0, -1), newCandle];
          }
          return [...prev.slice(-49), newCandle];
        });
      } catch (e) {
        console.error('Failed to parse candle update', e);
      }
    });
    return () => subscription.unsubscribe();
  }, [streamer.id, interval]);

  const pct = changePct(currentPrice, streamer.basePrice);

  const streamerTrades = useMemo(() => {
    return liveTrades.filter(t => t.streamerId === streamer.id);
  }, [liveTrades, streamer.id]);

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar">
      <button type="button" onClick={onBack} className="text-sm mb-4 flex items-center gap-1" style={{ color: '#626B7A' }}>
        ← 목록으로
      </button>

      <div className="mb-4">
        <h1 className="text-white text-xl font-bold">{streamer.name}</h1>
        <div className="flex items-baseline gap-3 mt-1">
          <span className="text-2xl font-black font-mono" style={{ color: priceColor(pct) }}>
            {fmt(currentPrice)}
          </span>
          <span className="text-sm font-bold" style={{ color: priceColor(pct) }}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
          </span>
          {direction !== 'none' && (
            <span className="text-xs" style={{ color: priceColor(pct) }}>
              {direction === 'up' ? '▲' : '▼'}
            </span>
          )}
        </div>
      </div>

      {/* 차트 컨트롤러 및 차트 영역 */}
      <div className="rounded-xl border p-4 mb-4 flex flex-col gap-4" style={{ background: '#131924', borderColor: '#222A3A' }}>
        {/* 컨트롤 헤더 */}
        <div className="flex flex-wrap justify-between items-center gap-2 pb-2" style={{ borderBottom: '1px solid #1A2232' }}>
          {/* 봉 주기 버튼 */}
          <div className="flex gap-1 bg-[#0E121A] p-0.5 rounded-lg border border-[#222A3A]">
            {(['1m', '5m', '1h', '1d', '1w'] as const).map(i => (
              <button
                key={i}
                type="button"
                onClick={() => setInterval(i)}
                className="px-2.5 py-1 rounded text-[10px] font-extrabold transition-all"
                style={{
                  background: interval === i ? '#1A2232' : 'transparent',
                  color: interval === i ? '#00E676' : '#626B7A',
                }}
              >
                {i === '1m' ? '1분' : i === '5m' ? '5분' : i === '1h' ? '1시' : i === '1d' ? '일봉' : '주봉'}
              </button>
            ))}
          </div>

          {/* 차트 타입 토글 */}
          <div className="flex gap-1 bg-[#0E121A] p-0.5 rounded-lg border border-[#222A3A]">
            {(['candle', 'line'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setChartType(type)}
                className="px-2.5 py-1 rounded text-[10px] font-extrabold transition-all"
                style={{
                  background: chartType === type ? '#1A2232' : 'transparent',
                  color: chartType === type ? '#00E676' : '#626B7A',
                }}
              >
                {type === 'candle' ? '봉차트 🕯️' : '선차트 📈'}
              </button>
            ))}
          </div>
        </div>

        {/* HTS 차트 본체 */}
        <InteractiveChart
          candles={candles}
          chartType={chartType}
          color={pct >= 0 ? '#FF5252' : '#3D8BFF'}
          interval={interval}
        />
      </div>

      {/* 실시간 체결 내역 */}
      <div className="rounded-xl border p-4 mb-4" style={{ background: '#131924', borderColor: '#222A3A' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white text-sm font-bold">실시간 체결 내역</h3>
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#00E67626', color: '#00E676' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#00E676' }}></span>
            LIVE
          </span>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto hide-scrollbar">
          {streamerTrades.length === 0 ? (
            <div className="text-center py-6 text-xs" style={{ color: '#626B7A' }}>
              새로운 거래 체결을 대기하고 있습니다...
            </div>
          ) : (
            streamerTrades.map((trade, idx) => {
              const d = new Date(trade.timestamp);
              const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
              const isBuy = trade.type === 'buy';
              return (
                <div key={idx} className="flex items-center justify-between py-1.5 text-xs border-b border-dashed" style={{ borderColor: '#1A2232' }}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono" style={{ color: '#626B7A' }}>{timeStr}</span>
                    <span className="font-bold px-1.5 py-0.5 rounded text-[10px]"
                      style={{
                        backgroundColor: isBuy ? '#FF525220' : '#3D8BFF20',
                        color: isBuy ? '#FF5252' : '#3D8BFF'
                      }}>
                      {isBuy ? '매수' : '매도'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-white">{trade.quantity.toLocaleString()}주</span>
                    <span className="font-mono font-bold text-right w-20" style={{ color: isBuy ? '#FF5252' : '#3D8BFF' }}>
                      {fmt(trade.price)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl border p-3" style={{ background: '#131924', borderColor: '#222A3A' }}>
          <p className="text-xs" style={{ color: '#8491A5' }}>총 거래량</p>
          <p className="text-white font-bold font-mono mt-1">{fmtCompact(streamer.totalVolume)}</p>
        </div>
        <div className="rounded-xl border p-3" style={{ background: '#131924', borderColor: '#222A3A' }}>
          <p className="text-xs" style={{ color: '#8491A5' }}>시초가 대비</p>
          <p className="font-bold font-mono mt-1" style={{ color: priceColor(pct) }}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
          </p>
        </div>
      </div>

      <button type="button" onClick={onOrder}
        className="w-full rounded-xl py-4 text-white font-bold text-base"
        style={{ backgroundColor: '#FF5252' }}>
        주문하기
      </button>
    </div>
  );
};

// ─── PricesView ───────────────────────────────────────────────────────────────
const PricesView = ({
  streamers, selectedStreamer, onSelectStreamer, onNavigate, liveTrades,
}: {
  streamers: Stock[];
  selectedStreamer: Stock | null;
  onSelectStreamer: (s: Stock | null) => void;
  onNavigate: (tab: AppTab) => void;
  liveTrades: LiveTrade[];
}) => {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    let s = streamers;
    if (search) s = s.filter(st => st.name.toLowerCase().includes(search.toLowerCase()));
    return [...s].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [streamers, search]);

  if (selectedStreamer) {
    return (
      <StockDetail
        streamer={selectedStreamer}
        onBack={() => onSelectStreamer(null)}
        onOrder={() => onNavigate('order')}
        liveTrades={liveTrades}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar">
      {/* 검색 */}
      <div className="relative mb-4">
        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#626B7A' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="종목명으로 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border text-white text-sm focus:outline-none"
          style={{ background: '#131924', borderColor: '#222A3A' }}
        />
      </div>

      {/* 헤더 */}
      <div className="flex items-center text-xs font-bold uppercase tracking-wider px-4 mb-2" style={{ color: '#626B7A' }}>
        <span className="flex-1">종목명</span>
        <span className="w-28 text-right">현재가</span>
        <span className="w-16 text-right">등락률</span>
      </div>

      <div className="space-y-1">
        {filtered.map(s => {
          const pct = changePct(s.price, s.basePrice);
          return (
            <div key={s.id} onClick={() => onSelectStreamer(s)}
              className="flex items-center px-4 py-3 rounded-xl border cursor-pointer transition-colors hover:border-blue-500"
              style={{ background: '#131924', borderColor: '#222A3A' }}>
              <div className="shrink-0 mr-3"
                style={{ padding: 2, borderRadius: '50%', background: s.isLive ? '#22C55E' : 'transparent' }}>
                <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-black"
                  style={{ backgroundColor: s.profileImageUrl ? 'transparent' : avatarColor(s.name) }}>
                  {s.profileImageUrl
                    ? <img src={s.profileImageUrl} alt={s.name} className="w-full h-full object-cover" />
                    : s.name.slice(0, 2)
                  }
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-white text-sm font-bold truncate">{s.name}</p>
                  {s.isLive && (
                    <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: '#FF3B3B26', color: '#FF3B3B' }}>
                      LIVE
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: '#626B7A' }}>{fmtCompact(s.totalVolume)}</p>
              </div>
              <div className="w-28 text-right">
                <p className="font-mono text-sm font-bold" style={{ color: priceColor(pct) }}>{fmt(s.price)}</p>
              </div>
              <div className="w-16 text-right">
                <p className="text-xs font-bold" style={{ color: priceColor(pct) }}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── OrderForm (hook 안전: 항상 streamer가 존재할 때만 렌더됨) ─────────────────
const OrderForm = ({
  streamer, user,
}: {
  streamer: Stock;
  user: User | null;
}) => {
  const { currentPrice } = useStockPrice(streamer.id, streamer.price);
  const tradeMutation = useTrade(user?.uid || 'spectator');
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(user?.uid);
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [qtyStr, setQtyStr] = useState('1');

  const qty = Math.max(0, parseInt(qtyStr, 10) || 0);
  const balance: number = Number(portfolio?.balance ?? 0);
  const held: number = Number(portfolio?.shares?.[streamer.id] ?? 0);

  const PRICE_IMPACT_FACTOR = 0.0005;
  const calcCost = (n: number, buy: boolean) => {
    if (n <= 0) return 0;
    const u = buy ? 1 + PRICE_IMPACT_FACTOR : 1 - PRICE_IMPACT_FACTOR;
    const fm = Math.pow(u, n);
    const sumMult = buy ? u * (fm - 1) / PRICE_IMPACT_FACTOR : u * (1 - fm) / PRICE_IMPACT_FACTOR;
    return Math.max(0, currentPrice * sumMult);
  };
  const totalCost = calcCost(qty, orderType === 'buy');
  const avgPrice = qty > 0 ? totalCost / qty : currentPrice; // 주문서 표시용 평균 체결 단가
  const postBalance = orderType === 'buy' ? balance - totalCost : balance + totalCost;
  const pct = changePct(currentPrice, streamer.basePrice);

  const getMaxBuy = () => {
    let low = 0, high = Math.floor(balance / currentPrice) + 1, ans = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (calcCost(mid, true) <= balance) { ans = mid; low = mid + 1; }
      else high = mid - 1;
    }
    return ans;
  };

  const maxBuy = balance > 0 ? getMaxBuy() : 0;
  const maxSell = held;

  const setQuick = (ratio: number) => {
    const max = orderType === 'buy' ? maxBuy : maxSell;
    setQtyStr(String(Math.max(1, Math.floor(max * ratio))));
  };

  const canBuy = !!user && qty > 0 && balance >= totalCost;
  const canSell = !!user && qty > 0 && held >= qty;
  const canSubmit = orderType === 'buy' ? canBuy : canSell;

  if (portfolioLoading) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: '#626B7A' }}>
        포트폴리오 불러오는 중...
      </div>
    );
  }

  const handleSubmit = () => {
    if (!canSubmit) return;
    tradeMutation.mutate({ streamerId: streamer.id, type: orderType, quantity: qty, estimatedPrice: currentPrice });
  };

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar">
      {/* 매수/매도 토글 */}
      <div className="rounded-xl p-1 flex mb-5" style={{ background: '#131924' }}>
        <button type="button" onClick={() => setOrderType('buy')}
          className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors"
          style={{ backgroundColor: orderType === 'buy' ? '#FF5252' : 'transparent', color: orderType === 'buy' ? '#fff' : '#626B7A' }}>
          매수
        </button>
        <button type="button" onClick={() => setOrderType('sell')}
          className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors"
          style={{ backgroundColor: orderType === 'sell' ? '#3D8BFF' : 'transparent', color: orderType === 'sell' ? '#fff' : '#626B7A' }}>
          매도
        </button>
      </div>

      {/* 선택 종목 */}
      <div className="mb-4">
        <p className="text-xs mb-1" style={{ color: '#8491A5' }}>선택 종목</p>
        <div className="rounded-xl border px-4 py-3" style={{ background: '#131924', borderColor: '#222A3A' }}>
          <p className="text-white font-bold text-sm">{streamer.name}
            <span className="font-mono ml-2" style={{ color: priceColor(pct) }}>({fmt(currentPrice)})</span>
          </p>
        </div>
      </div>

      {/* 주문 가격 */}
      <div className="mb-4">
        <p className="text-xs mb-1" style={{ color: '#8491A5' }}>예상 체결 단가 (슬리피지 포함)</p>
        <div className="rounded-xl border px-4 py-3 flex justify-between items-center" style={{ background: '#131924', borderColor: '#222A3A' }}>
          <p className="font-mono font-bold text-lg" style={{ color: priceColor(pct) }}>{fmt(avgPrice)}</p>
          <span className="text-xs" style={{ color: '#626B7A' }}>{qty > 0 ? '예상 단가' : '현재가'}</span>
        </div>
      </div>

      {/* 주문 수량 */}
      <div className="mb-3">
        <p className="text-xs mb-1" style={{ color: '#8491A5' }}>주문 수량 (주)</p>
        <input
          type="number"
          value={qtyStr}
          onChange={e => setQtyStr(e.target.value)}
          min="1"
          disabled={!user}
          placeholder={!user ? '로그인 필요' : '수량 입력'}
          className="w-full rounded-xl border py-3 px-4 text-white font-mono text-lg focus:outline-none disabled:opacity-50"
          style={{ background: '#131924', borderColor: '#222A3A' }}
        />
      </div>

      {/* 퀵 % 버튼 */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {([0.1, 0.25, 0.5, 1.0] as const).map(r => (
          <button key={r} type="button" onClick={() => setQuick(r)}
            className="rounded-lg py-2 text-xs font-bold transition-colors"
            style={{ background: '#1A2232', color: '#BAC4D1' }}>
            {r * 100}%
          </button>
        ))}
      </div>

      {/* 주문 요약 */}
      <div className="pt-4 mb-5" style={{ borderTop: '1px solid #222A3A' }}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm" style={{ color: '#8491A5' }}>주문 총액</span>
          <span className="font-mono text-xl font-bold" style={{ color: orderType === 'buy' ? '#FF5252' : '#3D8BFF' }}>
            {fmt(totalCost)}
          </span>
        </div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs" style={{ color: '#8491A5' }}>주문 후 잔액</span>
          <span className="text-xs font-mono font-bold text-white">{fmt(Math.max(0, postBalance))}</span>
        </div>
        {orderType === 'sell' && (
          <div className="flex justify-between items-center">
            <span className="text-xs" style={{ color: '#8491A5' }}>현재 보유량</span>
            <span className="text-xs font-mono font-bold text-white">{held}주</span>
          </div>
        )}
      </div>

      {/* 잔고 부족 안내 */}
      {orderType === 'buy' && !!user && qty > 0 && balance < totalCost && (
        <p className="text-xs text-center mb-3" style={{ color: '#FF5252' }}>
          잔고가 부족합니다 (필요: {fmt(totalCost)}, 보유: {fmt(balance)})
        </p>
      )}

      {/* 실행 버튼 */}
      <button type="button" onClick={handleSubmit}
        disabled={tradeMutation.isPending || !canSubmit}
        className="w-full rounded-xl py-4 text-white font-bold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: orderType === 'buy' ? '#FF5252' : '#3D8BFF' }}>
        {tradeMutation.isPending
          ? '주문 처리 중...'
          : orderType === 'buy' && !!user && qty > 0 && balance < totalCost
            ? '잔고 부족'
            : `${orderType === 'buy' ? '매수' : '매도'} 주문하기`}
      </button>
    </div>
  );
};

// ─── OrderView ────────────────────────────────────────────────────────────────
const OrderView = ({
  streamers, selectedStreamer, user, onSelectStreamer,
}: {
  streamers: Stock[];
  selectedStreamer: Stock | null;
  user: User | null;
  onSelectStreamer: (s: Stock) => void;
}) => {
  if (selectedStreamer) {
    return <OrderForm streamer={selectedStreamer} user={user} />;
  }

  // 종목 미선택 시 picker
  const sorted = useMemo(() => [...streamers].sort((a, b) => b.totalVolume - a.totalVolume), [streamers]);
  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar">
      <p className="text-white font-bold text-sm mb-4">주문할 종목을 선택하세요</p>
      <div className="space-y-2">
        {sorted.map(s => {
          const pct = changePct(s.price);
          return (
            <div key={s.id} onClick={() => onSelectStreamer(s)}
              className="flex items-center px-4 py-3 rounded-xl border cursor-pointer transition-colors hover:border-blue-500"
              style={{ background: '#131924', borderColor: '#222A3A' }}>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{s.name}</p>
                <p className="text-xs mt-0.5" style={{ color: '#626B7A' }}>{fmtCompact(s.totalVolume)}</p>
              </div>
              <div className="text-right ml-3 shrink-0">
                <p className="font-mono font-bold text-sm" style={{ color: priceColor(pct) }}>{fmt(s.price)}</p>
                <p className="text-xs font-bold mt-0.5" style={{ color: priceColor(pct) }}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── ChartView ────────────────────────────────────────────────────────────────
type ChartCategory = 'volume' | 'value' | 'surge' | 'drop' | 'new' | 'dividend';


const ChartView = ({
  streamers,
  onSelect,
}: {
  streamers: Stock[];
  onSelect: (s: Stock) => void;
}) => {
  const [category, setCategory] = useState<ChartCategory>('volume');
  const [volumeAsc, setVolumeAsc] = useState(false);
  const [valueAsc, setValueAsc] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (category !== 'dividend') return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [category]);

  const handleCategoryClick = (key: ChartCategory) => {
    if (key === 'volume' && category === 'volume') {
      setVolumeAsc(v => !v);
    } else if (key === 'value' && category === 'value') {
      setValueAsc(v => !v);
    } else {
      setCategory(key);
    }
  };

  const volumeLabel = `거래량${volumeAsc ? '↓' : '↑'}`;
  const valueLabel = `거래대금${valueAsc ? '↓' : '↑'}`;

  const CATEGORIES: { key: ChartCategory; label: string }[] = [
    { key: 'volume', label: volumeLabel },
    { key: 'value', label: valueLabel },
    { key: 'surge', label: '급상승' },
    { key: 'drop', label: '급하락' },
    { key: 'new', label: '신규상장' },
    { key: 'dividend', label: '배당' },
  ];

  const list = useMemo(() => {
    const s = [...streamers];
    switch (category) {
      case 'volume': return volumeAsc
        ? s.sort((a, b) => a.totalVolume - b.totalVolume).slice(0, 30)
        : s.sort((a, b) => b.totalVolume - a.totalVolume).slice(0, 30);
      case 'value': return valueAsc
        ? s.sort((a, b) => a.price * a.totalVolume - b.price * b.totalVolume).slice(0, 30)
        : s.sort((a, b) => b.price * b.totalVolume - a.price * a.totalVolume).slice(0, 30);
      case 'surge': return s.filter(st => changePct(st.price, st.basePrice) > 0).sort((a, b) => changePct(b.price, b.basePrice) - changePct(a.price, a.basePrice)).slice(0, 30);
      case 'drop': return s.filter(st => changePct(st.price, st.basePrice) < 0).sort((a, b) => changePct(a.price, a.basePrice) - changePct(b.price, b.basePrice)).slice(0, 30);
      case 'new': {
        const today = new Date();
        const y = today.getFullYear();
        const m = today.getMonth();
        const d = today.getDate();
        return s.filter(st => {
          if (!st.listedAt) return false;
          const ld = new Date(st.listedAt);
          return ld.getFullYear() === y && ld.getMonth() === m && ld.getDate() === d;
        }).slice(0, 30);
      }
      case 'dividend': return s.filter(st => st.isLive).sort((a, b) => (b.dividendPool ?? 0) - (a.dividendPool ?? 0));
      default: return s.slice(0, 30);
    }
  }, [streamers, category, volumeAsc, valueAsc]);

  const colLabel = category === 'value' ? '거래대금' : category === 'dividend' ? '다음 배당' : '거래량';

  const dividendRemainingMs = (s: Stock): number => {
    if (!s.isLive || !s.liveStartedAt) return -1;
    void tick; // force re-render each tick
    const startMs = new Date(s.liveStartedAt).getTime();
    const nextMs = ((s.dividendAccumulationCount ?? 0) + 1) * 10 * 60 * 1000;
    return nextMs - (Date.now() - startMs);
  };

  const fmtRemaining = (ms: number): string => {
    if (ms <= 0) return '곧 지급';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const expectedPerShare = (s: Stock): string => {
    const supply = s.totalSupply && s.totalSupply > 0 ? s.totalSupply : 1;
    const val = (s.price * 0.05) / supply;
    return val >= 1 ? `+${Math.floor(val)}코인` : `+${val.toFixed(2)}`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 카테고리 탭 */}
      <div className="flex gap-2 px-4 py-3 shrink-0 overflow-x-auto hide-scrollbar"
        style={{ borderBottom: '1px solid #222A3A' }}>
        {CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleCategoryClick(key)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
            style={{
              background: category === key ? '#00E676' : '#131924',
              color: category === key ? '#080A0F' : '#8491A5',
              border: '1px solid',
              borderColor: category === key ? '#00E676' : '#222A3A',
            }}>
            {label}
          </button>
        ))}
      </div>

      <>
          {/* 리스트 헤더 */}
          <div className="flex items-center px-4 py-2 shrink-0 text-xs font-bold uppercase tracking-wider"
            style={{ color: '#626B7A', borderBottom: '1px solid #1A2232', background: '#0E121A' }}>
            <span className="w-6 mr-3 text-center">#</span>
            <span className="flex-1">스트리머</span>
            <span className="w-24 text-right">현재가</span>
            {category !== 'dividend' && <span className="w-16 text-right">등락률</span>}
            <span className={`${category === 'dividend' ? 'w-28' : 'w-24'} text-right`}>{colLabel}</span>
          </div>

          {/* 리스트 */}
          <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar">
            {list.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#626B7A' }}>
                데이터가 없습니다
              </div>
            ) : list.map((s, i) => {
              const pct = changePct(s.price, s.basePrice);
              return (
                <div key={s.id} onClick={() => onSelect(s)}
                  className="flex items-center px-4 py-3 cursor-pointer"
                  style={{ borderBottom: '1px solid #1A2232' }}>
                  <span className="w-6 mr-3 text-sm font-bold text-center shrink-0"
                    style={{ color: i < 3 ? '#BAC4D1' : '#626B7A' }}>
                    {i + 1}
                  </span>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black overflow-hidden"
                      style={{ backgroundColor: s.profileImageUrl ? 'transparent' : avatarColor(s.name) }}>
                      {s.profileImageUrl ? (
                        <img src={s.profileImageUrl} alt={s.name} className="w-full h-full object-cover" />
                      ) : (
                        s.name.slice(0, 2)
                      )}
                    </div>
                    <p className="text-white text-sm font-bold truncate">{s.name}</p>
                  </div>
                  <div className="w-24 text-right shrink-0">
                    <p className="font-mono text-sm font-bold" style={{ color: priceColor(pct) }}>{fmt(s.price)}</p>
                  </div>
                  {category !== 'dividend' && (
                    <div className="w-16 text-right shrink-0">
                      <p className="text-xs font-bold" style={{ color: priceColor(pct) }}>
                        {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                      </p>
                    </div>
                  )}
                  {category === 'dividend' ? (
                    <div className="w-28 text-right shrink-0">
                      <p className="text-xs font-bold font-mono" style={{ color: '#00E676' }}>
                        {fmtRemaining(dividendRemainingMs(s))}
                      </p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: '#8491A5' }}>
                        {expectedPerShare(s)}/주
                      </p>
                    </div>
                  ) : (
                    <div className="w-24 text-right shrink-0">
                      <p className="text-xs font-mono" style={{ color: '#8491A5' }}>
                        {category === 'value' ? fmt(s.price * s.totalVolume) : fmtCompact(s.totalVolume)}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
    </div>
  );
};

// ─── ProfileView ──────────────────────────────────────────────────────────────
const ProfileView = ({
  user, portfolio, history, streamers, totalAssets, isAdmin,
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

  // 이름 편집 상태
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

  // 배당 내역
  const [dividendHistory, setDividendHistory] = useState<any[]>([]);
  const [dividendHistoryLoaded, setDividendHistoryLoaded] = useState(false);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    apiFetch('/api/dividends/my')
      .then(res => res.ok ? res.json() : [])
      .then((data: any[]) => { setDividendHistory(data); setDividendHistoryLoaded(true); })
      .catch(() => setDividendHistoryLoaded(true));
  }, [user]);

  // 종목 추가 상태
  const [addUrl, setAddUrl] = useState('');
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [addMsg, setAddMsg] = useState('');

  const handleAddStock = async () => {
    if (!addUrl.trim()) return;

    // URL에서 채널 ID 추출
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

    // 이미 등록된 종목인지 검증
    const alreadyExists = streamers.some(s => s.id === channelId);
    if (alreadyExists) {
      setAddStatus('error');
      setAddMsg('이미 추가된 종목입니다.');
      setTimeout(() => setAddStatus('idle'), 3000);
      return;
    }

    setAddStatus('loading');
    try {
      const { apiFetch } = await import('./lib/api');
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
                      +{Number(d.amount).toFixed(2)}
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
          <span className="text-sm" style={{ color: '#BAC4D1' }}>투자 자금 초기화하기 (1천만으로 세팅)</span>
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

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const streamers = useStocks();
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [selectedStreamer, setSelectedStreamer] = useState<Stock | null>(null);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);

  // 초기 실시간 거래 피드 로드 (DB에서 최근 50건의 거래 내역을 pre-populate)
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
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthChecking(false); });
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
      // 현재 게스트 계정에 Google 프로바이더를 연결 (UID 유지)
      await linkWithPopup(user, googleProvider);
      // 연동 성공 후 토큰을 강제 갱신하여 google.com identity 정보가 백엔드 토큰에 즉시 반영되도록 함
      await user.getIdToken(true);
      // 성공: UID 그대로 유지되므로 백엔드 변경 불필요
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') return;

      if (err.code === 'auth/credential-already-in-use') {
        // Google 계정이 이미 Firebase에 별도 UID로 존재하는 경우 → 데이터 이전
        const guestUid = user.uid;
        try {
          await signInWithCredential(auth, err.credential);
          const res = await apiFetch('/api/auth/link-google', {
            method: 'POST',
            body: JSON.stringify({ guestUid }),
          });
          if (!res.ok) throw new Error('서버 오류');
        } catch (mergeErr) {
          console.error(mergeErr);
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

  // 데스크탑: 내 정보 탭 선택 시 우측은 홈 표시
  const rightTab: Exclude<AppTab, 'profile'> = activeTab === 'profile' ? 'home' : activeTab;

  const NAV_ITEMS: { tab: AppTab; label: string; path: string }[] = [
    { tab: 'home', label: '홈', path: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { tab: 'prices', label: '시세', path: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z' },
    { tab: 'chart', label: '차트', path: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { tab: 'profile', label: '내 정보', path: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  ];

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row overflow-hidden" style={{ background: '#080A0F' }}>

      {/* 좌측 사이드바 - 내 정보 (데스크탑 항상, 모바일 내정보 탭) */}
      <div className={`${activeTab === 'profile' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[300px] md:shrink-0 h-full overflow-hidden`}
        style={{ background: '#0E121A', borderRight: '1px solid #222A3A' }}>
        {/* 로고 */}
        <div className="p-5" style={{ borderBottom: '1px solid #222A3A' }}>
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500 tracking-tighter">
            Spotchzxk
          </h1>
          <p className="text-xs font-bold uppercase tracking-widest mt-1" style={{ color: '#626B7A' }}>
            Global Streamer Exchange
          </p>
        </div>
        <div className="flex-1 overflow-hidden">
          <ProfileView
            user={user}
            portfolio={portfolio}
            history={history ?? []}
            streamers={streamers}
            totalAssets={totalAssets}
            isAdmin={false}
            onLoginGoogle={handleGoogleLogin}
            onLoginGuest={handleGuestLogin}
            onLogout={handleLogout}
            onReset={handleReset}
            onLinkGoogle={handleLinkGoogle}
            isResetting={resetMutation.isPending}
            remainingResets={portfolio?.remainingResets ?? 3}
            onSelect={handleSelectStreamer}
            onNavigate={setActiveTab}
          />
        </div>
      </div>

      {/* 우측 콘텐츠 영역 */}
      <div className={`${activeTab !== 'profile' ? 'flex' : 'hidden'} md:flex flex-col flex-1 overflow-hidden`}
        style={{ background: '#080A0F' }}>
        {/* 데스크탑 탭 바 */}
        <div className="hidden md:flex items-center px-5 shrink-0"
          style={{ background: '#0E121A', borderBottom: '1px solid #222A3A' }}>
          {(['home', 'prices', 'chart'] as const).map(tab => {
            const labels = { home: '홈', prices: '시세', chart: '차트' };
            const active = rightTab === tab;
            return (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                className="py-4 px-5 text-sm font-bold border-b-2 transition-colors"
                style={{
                  borderBottomColor: active ? '#00E676' : 'transparent',
                  color: active ? '#00E676' : '#626B7A',
                }}>
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* 탭 콘텐츠 */}
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

      {/* 하단 탭 네비게이션 (모바일) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 flex z-50"
        style={{ background: '#131924CC', backdropFilter: 'blur(8px)', borderTop: '1px solid #222A3A' }}>
        {NAV_ITEMS.map(({ tab, label, path }) => {
          const active = activeTab === tab;
          return (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className="flex-1 py-3 flex flex-col items-center gap-1 transition-colors"
              style={{ color: active ? '#00E676' : '#626B7A' }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={path} />
              </svg>
              <span className="text-[10px] font-bold">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default App;
