// 종목 상세 화면: 가격, 배당, 차트, 주문 진입 정보를 한 종목 기준으로 보여줍니다.
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

export const StockDetail = ({
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

  // 종목/인터벌 변경 시 fetch용 ref (재연결 핸들러에서 최신값 참조)
  const fetchParamsRef = useRef({ stockId: streamer.id, interval });
  fetchParamsRef.current = { stockId: streamer.id, interval };

  const fetchCandles = (stockId: string, iv: string, clearFirst: boolean) => {
    if (clearFirst) setCandles([]);
    apiFetch(`/api/stocks/${stockId}/candles?interval=${iv}&count=50`)
      .then(res => res.ok ? res.json() : null)
      .then((data: { bucketStart: number; open: number; high: number; low: number; close: number }[] | null) => {
        if (!data) return; // 실패 시 기존 데이터 유지
        setCandles(data.map(c => ({
          time: (Math.floor(c.bucketStart / 1000) + 9 * 3600) as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })));
      })
      .catch(() => {/* 에러 시 기존 캔들 유지 */});
  };

  // 종목/인터벌 변경 시 초기 로드
  useEffect(() => {
    fetchCandles(streamer.id, interval, true);
  }, [streamer.id, interval]); // eslint-disable-line react-hooks/exhaustive-deps

  // STOMP 재연결 시 캔들 재조회 (서버 재시작 후 복구)
  useEffect(() => {
    const unsub = registerOnConnect(() => {
      const { stockId, interval: iv } = fetchParamsRef.current;
      fetchCandles(stockId, iv, false); // 기존 데이터 유지하면서 갱신
    });
    return () => unsub();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="flex flex-wrap justify-between items-center gap-2 pb-2" style={{ borderBottom: '1px solid #1A2232' }}>
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
