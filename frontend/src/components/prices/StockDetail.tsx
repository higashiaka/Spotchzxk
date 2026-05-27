import { useState, useEffect, useRef, useMemo } from 'react';
import { UTCTimestamp } from 'lightweight-charts';
import { Stock } from '../../hooks/useStocks';
import { useStockPrice } from '../../hooks/useStockPrice';
import { subscribeStomp, registerOnConnect } from '../../lib/stompClient';
import { apiFetch } from '../../lib/api';
import { LiveTrade } from '../../types';
import { fmt, fmtCompact, changePct, priceColor } from '../../utils';
import { InteractiveChart } from '../chart/InteractiveChart';
import { Candle } from '../chart/chartUtils';

interface StockOrderHistoryItem {
  streamerId: string;
  type: 'buy' | 'sell';
  quantity: number;
  executedPrice?: number;
  estimatedPrice: number;
  status: string;
  createdAt: number;
}

/** 종목 상세 화면 컴포넌트.
 *  실시간 가격, 인터벌별 캔들 차트, 종목 내 체결 내역, 주문 진입 버튼을 제공
 *
 *  Stock detail screen component.
 *  Shows real-time price, candlestick chart by interval,
 *  trade history for the stock, and an order entry button */
export const StockDetail = ({
  streamer, onOrder, liveTrades,
}: {
  /** 표시할 종목 데이터 / Stock data to display */
  streamer: Stock;
  /** 주문 화면으로 이동하는 핸들러 / Handler to navigate to the order screen */
  onOrder: () => void;
  /** 전체 실시간 체결 내역 (해당 종목 필터링에 사용) / All live trades; filtered to this stock */
  liveTrades: LiveTrade[];
}) => {
  const { currentPrice, direction } = useStockPrice(streamer.id, streamer.price);

  /** 선택된 차트 인터벌 / Selected chart interval */
  const [interval, setInterval] = useState<'1m' | '5m' | '1h' | '1d' | '1w'>('5m');

  /** 봉차트/선차트 전환 / Toggle between candlestick and line chart */
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');

  /** 캔들 데이터 배열 / Candlestick data array */
  const [candles, setCandles] = useState<Candle[]>([]);
  /** 서버에서 불러온 선택 종목의 전체 체결 내역 / Full execution history loaded for the selected stock */
  const [stockTrades, setStockTrades] = useState<LiveTrade[]>([]);

  /** 재연결 핸들러에서 최신 종목·인터벌을 참조하기 위한 ref
   *  Ref holding latest stockId and interval for use inside the reconnect handler */
  const fetchParamsRef = useRef({ stockId: streamer.id, interval });
  fetchParamsRef.current = { stockId: streamer.id, interval };

  /** REST API로 캔들 데이터를 조회
   *  Fetches candle data from the REST API
   *  @param clearFirst - true이면 기존 캔들을 지우고 로드 / If true, clears existing candles before loading */
  const fetchCandles = (stockId: string, iv: string, clearFirst: boolean) => {
    if (clearFirst) setCandles([]);
    apiFetch(`/api/stocks/${stockId}/candles?interval=${iv}&count=50`)
      .then(res => res.ok ? res.json() : null)
      .then((data: { bucketStart: number; open: number; high: number; low: number; close: number }[] | null) => {
        if (!data) return;
        setCandles(data.map(c => ({
          time: (Math.floor(c.bucketStart / 1000) + 9 * 3600) as UTCTimestamp,
          open: c.open, high: c.high, low: c.low, close: c.close,
        })));
      })
      .catch(() => {/* 에러 시 기존 캔들 유지 / Keep existing candles on error */});
  };

  // 종목·인터벌 변경 시 캔들 초기 로드 / Load candles on stock or interval change
  useEffect(() => {
    fetchCandles(streamer.id, interval, true);
  }, [streamer.id, interval]); // eslint-disable-line react-hooks/exhaustive-deps

  // 종목 변경 시 해당 종목의 전체 체결 내역 로드
  // Load the selected stock's full execution history when the stock changes
  useEffect(() => {
    setStockTrades([]);
    apiFetch(`/api/orders/history?streamerId=${encodeURIComponent(streamer.id)}`)
      .then(res => res.ok ? res.json() : null)
      .then((orders: StockOrderHistoryItem[] | null) => {
        if (!orders) return;
        const trades = orders
          .filter(order => order.status === 'completed')
          .map(order => ({
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
      .catch(() => {/* 체결 내역 로드 실패 시 실시간 수신분만 표시 / Fall back to live trades only */});
  }, [streamer.id, streamer.name]);

  // STOMP 재연결 시 캔들 재조회 (서버 재시작 후 데이터 복구)
  // Re-fetch candles on STOMP reconnect (recovers data after server restart)
  useEffect(() => {
    const unsub = registerOnConnect(() => {
      const { stockId, interval: iv } = fetchParamsRef.current;
      fetchCandles(stockId, iv, false);
    });
    return () => unsub();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // STOMP 실시간 캔들 업데이트 구독
  // Subscribe to real-time candle updates via STOMP
  useEffect(() => {
    const subscription = subscribeStomp(`/topic/candles/${streamer.id}`, (message) => {
      try {
        const updates = JSON.parse(message.body) as Record<string, { bucketStart: number; open: number; high: number; low: number; close: number }>;
        const updated = updates[interval];
        if (!updated) return;
        const newCandle: Candle = {
          time: (Math.floor(updated.bucketStart / 1000) + 9 * 3600) as UTCTimestamp,
          open: updated.open, high: updated.high, low: updated.low, close: updated.close,
        };
        setCandles(prev => {
          if (prev.length === 0) return [newCandle];
          const last = prev[prev.length - 1];
          // 같은 시간대면 마지막 캔들 업데이트, 새 시간대면 추가 (최대 50개 유지)
          // Update last candle if same bucket; otherwise append (keep max 50)
          if (last.time === newCandle.time) return [...prev.slice(0, -1), newCandle];
          return [...prev.slice(-49), newCandle];
        });
      } catch (e) {
        console.error('Failed to parse candle update', e);
      }
    });
    return () => subscription.unsubscribe();
  }, [streamer.id, interval]);

  const pct = changePct(currentPrice, streamer.basePrice);

  /** 해당 종목의 전체 체결 내역과 실시간 수신분을 병합
   *  Merges persisted stock history with live events for this streamer */
  const streamerTrades = useMemo(() => {
    const merged = new Map<string, LiveTrade>();
    [...liveTrades.filter(t => t.streamerId === streamer.id), ...stockTrades].forEach(trade => {
      const key = `${trade.timestamp}-${trade.type}-${trade.quantity}-${trade.price}`;
      merged.set(key, trade);
    });
    return [...merged.values()].sort((a, b) => b.timestamp - a.timestamp);
  }, [liveTrades, stockTrades, streamer.id]);

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar">
      {/* 종목명 및 현재가 / Stock name and current price */}
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

      {/* 차트 컨트롤 및 InteractiveChart / Chart controls and InteractiveChart */}
      <div className="rounded-xl border p-4 mb-4 flex flex-col gap-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
        <div className="flex flex-wrap justify-between items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--border-card)' }}>
          {/* 인터벌 선택 버튼 / Interval selector buttons */}
          <div className="flex gap-1 p-0.5 rounded-lg border" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)' }}>
            {(['1m', '5m', '1h', '1d', '1w'] as const).map(i => (
              <button key={i} type="button" onClick={() => setInterval(i)}
                className="px-2.5 py-1 rounded text-[10px] font-extrabold transition-all"
                style={{
                  background: interval === i ? 'var(--bg-card)' : 'transparent',
                  color: interval === i ? '#00E676' : 'var(--text-dim)',
                }}>
                {i === '1m' ? '1분' : i === '5m' ? '5분' : i === '1h' ? '1시' : i === '1d' ? '일봉' : '주봉'}
              </button>
            ))}
          </div>

          {/* 차트 타입 선택 버튼 / Chart type selector buttons */}
          <div className="flex gap-1 p-0.5 rounded-lg border" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)' }}>
            {(['candle', 'line'] as const).map(type => (
              <button key={type} type="button" onClick={() => setChartType(type)}
                className="px-2.5 py-1 rounded text-[10px] font-extrabold transition-all"
                style={{
                  background: chartType === type ? 'var(--bg-card)' : 'transparent',
                  color: chartType === type ? '#00E676' : 'var(--text-dim)',
                }}>
                {type === 'candle' ? '봉차트 🕯️' : '선차트 📈'}
              </button>
            ))}
          </div>
        </div>

        <InteractiveChart
          candles={candles}
          chartType={chartType}
          color={pct >= 0 ? '#FF5252' : '#3D8BFF'}
          interval={interval}
        />
      </div>

      {/* 주문하기 버튼 / Order entry button */}
      <button type="button" onClick={onOrder}
        className="w-full rounded-xl py-4 mb-4 text-white font-bold text-base"
        style={{ backgroundColor: '#FF5252' }}>
        주문하기
      </button>

      {/* 실시간 체결 내역 / Real-time execution history for this stock */}
      <div className="rounded-xl border p-4 mb-4" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
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
            <div className="text-center py-6 text-xs" style={{ color: 'var(--text-dim)' }}>
              새로운 거래 체결을 대기하고 있습니다...
            </div>
          ) : (
            streamerTrades.map((trade, idx) => {
              const d = new Date(trade.timestamp);
              const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
              const isBuy = trade.type === 'buy';
              return (
                <div key={idx} className="flex items-center justify-between py-1.5 text-xs border-b border-dashed" style={{ borderColor: 'var(--bg-card)' }}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono" style={{ color: 'var(--text-dim)' }}>{timeStr}</span>
                    <span className="font-bold px-1.5 py-0.5 rounded text-[10px]"
                      style={{ backgroundColor: isBuy ? '#FF525220' : '#3D8BFF20', color: isBuy ? '#FF5252' : '#3D8BFF' }}>
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

      {/* 종목 통계 요약 / Stock statistics summary */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl border p-3" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>총 거래량</p>
          <p className="text-white font-bold font-mono mt-1">{fmtCompact(streamer.totalVolume)}</p>
        </div>
        <div className="rounded-xl border p-3" style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>시초가 대비</p>
          <p className="font-bold font-mono mt-1" style={{ color: priceColor(pct) }}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
          </p>
        </div>
      </div>

    </div>
  );
};
