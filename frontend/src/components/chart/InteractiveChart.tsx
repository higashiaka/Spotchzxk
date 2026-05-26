// 실시간 차트: lightweight-charts를 사용해 종목별 캔들 데이터를 렌더링합니다.
import { useState, useEffect, useRef } from 'react';
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  IChartApi, ISeriesApi, UTCTimestamp,
} from 'lightweight-charts';
import { Candle, formatCandleTime, applySeriesData, updateSeriesLast } from './chartUtils';

export const InteractiveChart = ({
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

  useEffect(() => {
    if (!seriesRef.current || chartType !== 'line') return;
    const lineColor = color === '#FF5252' ? '#FF3B30' : '#007AFF';
    (seriesRef.current as ISeriesApi<'Area'>).applyOptions({
      lineColor, topColor: lineColor + '40', bottomColor: lineColor + '00',
    });
  }, [color, chartType]);

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
