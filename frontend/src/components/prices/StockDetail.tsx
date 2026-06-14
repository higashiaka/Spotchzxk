import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import { UTCTimestamp } from 'lightweight-charts';
import { Stock } from '../../hooks/useStocks';
import { useStockPrice } from '../../hooks/useStockPrice';
import { usePortfolio } from '../../hooks/usePortfolio';
import { subscribeStomp, registerOnConnect } from '../../lib/stompClient';
import { apiFetch } from '../../lib/api';
import { LiveTrade } from '../../types';
import { avatarColor, fmtCompact, fmtKorean, fmtShares, changePct, priceColor, fmtPct } from '../../utils';
import { InteractiveChart } from '../chart/InteractiveChart';
import { Candle } from '../chart/chartUtils';
import { OrderForm } from '../order/OrderForm';
import { OrderBookPanel } from '../order/OrderBookPanel';
import { PendingOrdersPanel } from '../order/PendingOrdersPanel';

interface StockOrderHistoryItem {
  id: string;
  streamerId: string;
  type: 'buy' | 'sell';
  quantity: number;
  executedPrice?: number;
  estimatedPrice: number;
  status: string;
  createdAt: number;
}

const CANDLE_PAGE_SIZE = 100;
const KST_OFFSET_SECONDS = 9 * 3600;
// lightweight-charts uses JS Number internally; prices above Number.MAX_SAFE_INTEGER (~9e15)
// cause rendering freezes. Scale down OHLC values before passing to chart and restore in formatter.
const CHART_SAFE_MAX = 1_000_000_000; // cap scaled prices at 1B for chart rendering

const calcScaleFactor = (price: number): number => {
  if (!Number.isFinite(price) || price <= 0 || price <= CHART_SAFE_MAX) return 1;
  return Math.pow(10, Math.floor(Math.log10(price)) - 8);
};

const scalePrice = (price: number, sf: number): number => {
  const scaled = sf === 1 ? price : price / sf;
  return Number.isFinite(scaled) ? Math.max(1, Math.min(CHART_SAFE_MAX, Math.round(scaled))) : 1;
};

const toChartCandle = (
  c: { bucketStart: number; open: number; high: number; low: number; close: number },
  sf: number,
): Candle => {
  const open = scalePrice(c.open, sf);
  const high = scalePrice(c.high, sf);
  const low = scalePrice(c.low, sf);
  const close = scalePrice(c.close, sf);
  return {
    time: (Math.floor(c.bucketStart / 1000) + KST_OFFSET_SECONDS) as UTCTimestamp,
    open,
    high: Math.max(open, high, low, close),
    low: Math.min(open, high, low, close),
    close,
  };
};

const toBucketStartMs = (time: UTCTimestamp) => (Number(time) - KST_OFFSET_SECONDS) * 1000;

export const StockDetail = ({
  streamer, user, onOrder, liveTrades,
}: {
  streamer: Stock;
  user: User | null;
  onOrder: (type: 'buy' | 'sell') => void;
  liveTrades: LiveTrade[];
}) => {
  const { currentPrice, direction } = useStockPrice(streamer.id, streamer.price);
  const { data: portfolio } = usePortfolio(user?.uid);
  const [interval, setInterval] = useState<'1m' | '5m' | '1h' | '1d' | '1w'>('5m');
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [splitEvents, setSplitEvents] = useState<{ executedAt: number; splitRatio: number }[]>([]);
  const [hasMoreCandles, setHasMoreCandles] = useState(true);
  const [isLoadingMoreCandles, setIsLoadingMoreCandles] = useState(false);
  const [stockTrades, setStockTrades] = useState<LiveTrade[]>([]);
  const [stockTradesError, setStockTradesError] = useState(false);
  const [qtyStr, setQtyStr] = useState('1');
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [scaleFactor] = useState(() => calcScaleFactor(streamer.price));
  const scaleFactorRef = useRef(scaleFactor);
  const fetchParamsRef = useRef({ stockId: streamer.id, interval });
  fetchParamsRef.current = { stockId: streamer.id, interval };
  const candlesRef = useRef<Candle[]>([]);
  const hasMoreCandlesRef = useRef(true);
  const isLoadingMoreCandlesRef = useRef(false);

  useEffect(() => { candlesRef.current = candles; }, [candles]);
  useEffect(() => { hasMoreCandlesRef.current = hasMoreCandles; }, [hasMoreCandles]);
  useEffect(() => { isLoadingMoreCandlesRef.current = isLoadingMoreCandles; }, [isLoadingMoreCandles]);

  const fetchCandles = useCallback((
    stockId: string,
    iv: string,
    options: { before?: number; prepend?: boolean; reset?: boolean } = {},
  ) => {
    if (options.reset) {
      setCandles([]);
      setHasMoreCandles(true);
      hasMoreCandlesRef.current = true;
    }

    const params = new URLSearchParams({
      interval: iv,
      count: String(CANDLE_PAGE_SIZE),
    });
    if (options.before) params.set('before', String(options.before));

    return apiFetch(`/api/stocks/${stockId}/candles?${params.toString()}`)
      .then(res => res.ok ? res.json() : null)
      .then((data: { candles: { bucketStart: number; open: number; high: number; low: number; close: number }[]; splitEvents: { executedAt: number; splitRatio: number }[] } | null) => {
        if (!data) return;
        const sf = scaleFactorRef.current;
        const next = data.candles.map(c => toChartCandle(c, sf));
        setSplitEvents(data.splitEvents ?? []);
        setHasMoreCandles(next.length >= CANDLE_PAGE_SIZE);
        if (options.prepend) {
          setCandles(prev => {
            const existing = new Set(prev.map(c => c.time));
            return [...next.filter(c => !existing.has(c.time)), ...prev];
          });
        } else {
          setCandles(next);
        }
      })
      .catch(() => {});
  }, []);

  const loadMoreCandles = useCallback(() => {
    const { stockId, interval: iv } = fetchParamsRef.current;
    const oldest = candlesRef.current[0];
    if (!oldest || !hasMoreCandlesRef.current || isLoadingMoreCandlesRef.current) return;

    isLoadingMoreCandlesRef.current = true;
    setIsLoadingMoreCandles(true);
    fetchCandles(stockId, iv, {
      before: toBucketStartMs(oldest.time),
      prepend: true,
    }).finally(() => {
      isLoadingMoreCandlesRef.current = false;
      setIsLoadingMoreCandles(false);
    });
  }, [fetchCandles]);

  useEffect(() => {
    fetchCandles(streamer.id, interval, { reset: true });
  }, [streamer.id, interval, fetchCandles]);

  useEffect(() => {
    setQtyStr('1');
    setOrderType('buy');
  }, [streamer.id]);

  useEffect(() => {
    setStockTrades([]);
    setStockTradesError(false);
    apiFetch(`/api/orders/history?streamerId=${encodeURIComponent(streamer.id)}`)
      .then(res => res.ok ? res.json() : null)
      .then((orders: StockOrderHistoryItem[] | null) => {
        if (!orders) return;
        const trades = orders
          .map(order => ({
            id: order.id,
            streamerId: order.streamerId,
            streamerName: streamer.name,
            type: order.type,
            quantity: order.quantity,
            price: order.executedPrice ?? order.estimatedPrice,
            timestamp: order.createdAt,
          }))
          .sort((a, b) => b.timestamp - a.timestamp);
        setStockTrades(trades);
      })
      .catch(() => setStockTradesError(true));
  }, [streamer.id, streamer.name]);

  useEffect(() => {
    const unsub = registerOnConnect(() => {
      const { stockId, interval: iv } = fetchParamsRef.current;
      fetchCandles(stockId, iv);
    });
    return () => unsub();
  }, [fetchCandles]);

  useEffect(() => {
    const subscription = subscribeStomp(`/topic/candles/${streamer.id}`, (message) => {
      try {
        const updates = JSON.parse(message.body) as Record<string, { bucketStart: number; open: number; high: number; low: number; close: number }>;
        const updated = updates[interval];
        if (!updated) return;
        const newCandle: Candle = toChartCandle(updated, scaleFactorRef.current);
        setCandles(prev => {
          if (prev.length === 0) return [newCandle];
          const last = prev[prev.length - 1];
          if (last.time === newCandle.time) return [...prev.slice(0, -1), newCandle];
          return [...prev, newCandle];
        });
      } catch (e) {
        console.error('Failed to parse candle update', e);
      }
    });
    return () => subscription.unsubscribe();
  }, [streamer.id, interval]);

  const pct = changePct(currentPrice, streamer.basePrice);
  const heldQty = Number(portfolio?.shares?.[streamer.id] ?? 0);
  const avgPrice = Number(portfolio?.avgPrices?.[streamer.id] ?? 0);
  const holdingValue = heldQty * currentPrice;
  const holdingCost = heldQty * avgPrice;
  const holdingPnL = holdingValue - holdingCost;
  const holdingPnLPct = holdingCost > 0 ? (holdingPnL / holdingCost) * 100 : 0;

  const streamerTrades = useMemo(() => {
    const merged = new Map<string, LiveTrade>();
    [...liveTrades.filter(t => t.streamerId === streamer.id), ...stockTrades].forEach(trade => {
      const key = trade.id ?? `${trade.timestamp}-${trade.type}-${trade.quantity}-${trade.price}`;
      merged.set(key, trade);
    });
    return [...merged.values()].sort((a, b) => b.timestamp - a.timestamp);
  }, [liveTrades, stockTrades, streamer.id]);

  const tradeHistoryPanel = (
    <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white text-sm md:text-base font-bold">실시간 체결 내역</h3>
        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent)' }}></span>
          LIVE
        </span>
      </div>
      <div className="space-y-2 max-h-48 md:max-h-[360px] overflow-y-auto hide-scrollbar">
        {stockTradesError ? (
          <div className="text-center py-6 text-xs" style={{ color: '#FF6B6B' }}>
            체결 내역을 불러오지 못했습니다.
          </div>
        ) : streamerTrades.length === 0 ? (
          <div className="text-center py-6 text-xs" style={{ color: 'var(--text-dim)' }}>
            새로운 거래 체결을 대기하고 있습니다...
          </div>
        ) : (
          streamerTrades.map((trade, idx) => {
            const d = new Date(trade.timestamp);
            const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
            const isBuy = trade.type === 'buy';
            return (
              <div key={idx} className="flex items-center justify-between py-1.5 text-xs border-b border-dashed" style={{ borderColor: 'var(--border-card)' }}>
                <div className="flex items-center gap-2">
                  <span className="font-mono" style={{ color: 'var(--text-dim)' }}>{timeStr}</span>
                  <span className="font-bold px-1.5 py-0.5 rounded text-[10px]"
                    style={{ backgroundColor: isBuy ? '#FF525220' : '#3D8BFF20', color: isBuy ? '#FF5252' : '#3D8BFF' }}>
                    {isBuy ? '매수' : '매도'}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-white">{fmtShares(trade.quantity)}</span>
                  <span className="font-mono font-bold text-right w-20" style={{ color: isBuy ? '#FF5252' : '#3D8BFF' }}>
                    {fmtKorean(trade.price)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-24 hide-scrollbar touch-pan-y">
      <div className="mb-4 md:mb-5 flex items-center gap-3 md:gap-4">
        <div className="shrink-0"
          style={{ padding: 3, borderRadius: '50%', background: streamer.isLive ? '#22C55E' : 'transparent' }}>
          <div className="w-14 h-14 md:w-20 md:h-20 rounded-full overflow-hidden flex items-center justify-center text-white text-lg md:text-2xl font-black"
            style={{ backgroundColor: streamer.profileImageUrl ? 'transparent' : avatarColor(streamer.name) }}>
            {streamer.profileImageUrl ? (
              <img src={streamer.profileImageUrl} alt={streamer.name} className="w-full h-full object-cover" />
            ) : (
              streamer.name.slice(0, 2)
            )}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-white text-xl md:text-3xl font-bold truncate">{streamer.name}</h1>
            {streamer.isLive && (
              <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: '#FF3B3B26', color: '#FF3B3B' }}>
                LIVE
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-2xl md:text-4xl font-black font-mono" style={{ color: priceColor(pct) }}>
              {fmtKorean(currentPrice)}
            </span>
            <span className="text-sm md:text-lg font-bold shrink-0 whitespace-nowrap" style={{ color: priceColor(pct) }}>
              {fmtPct(pct)}
            </span>
            {direction !== 'none' && (
              <span className="text-xs md:text-sm" style={{ color: priceColor(pct) }}>
                {direction === 'up' ? '▲' : '▼'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* PC: 2-column × 2-row flat grid — row1 height auto-matched via stretch on both sides */}
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_380px] md:gap-5">

        {/* [row1 col1] chart card */}
        <div className="rounded-xl border p-4 mb-4 md:mb-0 flex flex-col gap-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
          <div className="flex flex-wrap justify-between items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--border-card)' }}>
            <div className="flex gap-1 p-0.5 rounded-lg border" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)' }}>
              {(['1m', '5m', '1h', '1d', '1w'] as const).map(i => (
                <button key={i} type="button" onClick={() => setInterval(i)}
                  className="px-2.5 md:px-3 py-1 md:py-1.5 rounded text-[10px] md:text-xs font-extrabold transition-all"
                  style={{
                    background: interval === i ? 'var(--bg-card)' : 'transparent',
                    color: interval === i ? 'var(--accent)' : 'var(--text-dim)',
                  }}>
                  {i === '1m' ? '1분' : i === '5m' ? '5분' : i === '1h' ? '1시' : i === '1d' ? '일봉' : '주봉'}
                </button>
              ))}
            </div>
            <div className="flex gap-1 p-0.5 rounded-lg border" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)' }}>
              {(['candle', 'line'] as const).map(type => (
                <button key={type} type="button" onClick={() => setChartType(type)}
                  className="px-2.5 md:px-3 py-1 md:py-1.5 rounded text-[10px] md:text-xs font-extrabold transition-all"
                  style={{
                    background: chartType === type ? 'var(--bg-card)' : 'transparent',
                    color: chartType === type ? 'var(--accent)' : 'var(--text-dim)',
                  }}>
                  {type === 'candle' ? '봉차트' : '선차트'}
                </button>
              ))}
            </div>
          </div>
          <InteractiveChart
            candles={candles}
            scaleFactor={scaleFactor}
            splitEvents={splitEvents}
            chartType={chartType}
            color={pct >= 0 ? '#FF5252' : '#3D8BFF'}
            interval={interval}
            hasMore={hasMoreCandles}
            isLoadingMore={isLoadingMoreCandles}
            onLoadMore={loadMoreCandles}
            className="md:flex-1 md:min-h-0"
          />
        </div>

        {/* [row1 col2] quick order (PC only) */}
        <div className="hidden md:flex flex-col rounded-xl border p-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
          <h3 className="text-white text-base font-bold mb-4">빠른 주문</h3>
          <OrderForm
            streamer={streamer}
            user={user}
            qtyStr={qtyStr}
            setQtyStr={setQtyStr}
            orderType={orderType}
            setOrderType={setOrderType}
            embedded
          />
        </div>

        {/* [row2 col1] mobile buttons + mobile trade history + holdings + stats */}
        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-2 mb-4 md:hidden">
            <button type="button" onClick={() => onOrder('buy')}
              className="rounded-xl py-4 text-white font-bold text-base transition-all hover:brightness-110 active:scale-[0.99]"
              style={{ backgroundColor: '#FF5252' }}>
              매수
            </button>
            <button type="button" onClick={() => onOrder('sell')}
              className="rounded-xl py-4 text-white font-bold text-base transition-all hover:brightness-110 active:scale-[0.99]"
              style={{ backgroundColor: '#3D8BFF' }}>
              매도
            </button>
          </div>

          <div className="md:hidden mb-4">
            {tradeHistoryPanel}
          </div>

          <div className="rounded-xl border p-4 md:p-5 mb-4 md:mb-5" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-white text-sm md:text-base font-bold">내 보유 현황</h3>
              <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                {heldQty > 0 ? `${fmtShares(heldQty)} 보유` : '미보유'}
              </span>
            </div>
            {!user ? (
              <p className="text-sm py-3" style={{ color: 'var(--text-dim)' }}>
                로그인하면 이 종목의 보유 수량과 손익을 확인할 수 있습니다.
              </p>
            ) : heldQty <= 0 ? (
              <p className="text-sm py-3" style={{ color: 'var(--text-dim)' }}>
                아직 보유 중인 수량이 없습니다.
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>보유 수량</p>
                  <p className="text-white font-bold font-mono">{fmtShares(heldQty)}</p>
                </div>
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>평균 단가</p>
                  <p className="text-white font-bold font-mono">{fmtKorean(avgPrice)}</p>
                </div>
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>평가 금액</p>
                  <p className="text-white font-bold font-mono">{fmtKorean(holdingValue)}</p>
                </div>
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>평가 손익</p>
                  <p className="font-bold font-mono" style={{ color: priceColor(holdingPnLPct) }}>
                    {holdingPnL >= 0 ? '+' : ''}{fmtKorean(holdingPnL)}
                  </p>
                  <p className="text-xs font-bold mt-0.5 whitespace-nowrap" style={{ color: priceColor(holdingPnLPct) }}>
                    {fmtPct(holdingPnLPct)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-xl border p-3 md:p-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
              <p className="text-xs md:text-sm" style={{ color: 'var(--text-muted)' }}>총 거래량</p>
              <p className="text-white font-bold font-mono mt-1 md:text-lg">{fmtCompact(streamer.totalVolume)}</p>
            </div>
            <div className="rounded-xl border p-3 md:p-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
              <p className="text-xs md:text-sm" style={{ color: 'var(--text-muted)' }}>시초가 대비</p>
              <p className="font-bold font-mono mt-1 md:text-lg whitespace-nowrap" style={{ color: priceColor(pct) }}>
                {fmtPct(pct)}
              </p>
            </div>
          </div>
          <div className="hidden md:block mb-6">
            {tradeHistoryPanel}
          </div>
        </div>

        {/* [row2 col2] order book + pending orders (PC only) */}
        <div className="hidden md:flex flex-col gap-3">
          <OrderBookPanel streamerId={streamer.id} />
          <PendingOrdersPanel userId={user?.uid} streamerId={streamer.id} />
        </div>

      </div>
    </div>
  );
};
