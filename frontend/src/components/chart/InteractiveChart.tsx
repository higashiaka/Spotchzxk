import { useState, useEffect, useRef } from 'react';
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  IChartApi, ISeriesApi, UTCTimestamp,
} from 'lightweight-charts';
import { Candle, formatCandleTime, applySeriesData, updateSeriesLast } from './chartUtils';
import { useTheme } from '../../contexts/ThemeContext';
import { fmtKorean } from '../../utils';

/** Theme-specific chart colors */
const chartColors = {
  dark: {
    bg:        '#0E121A',
    text:      '#626B7A',
    grid:      '#1A2232',
    border:    '#1A2232',
    timeBadge: '#1A2232',
  },
  light: {
    bg:        '#FFFFFF',
    text:      '#94A3B8',
    grid:      '#E2E8F0',
    border:    '#E2E8F0',
    timeBadge: '#E9EEF4',
  },
};

const formatScaledPrice = (value: number, scaleFactor: number): string => {
  const restored = value * scaleFactor;
  return Number.isFinite(restored) ? fmtKorean(restored) : 'overflow';
};

/** Interactive chart component built on lightweight-charts.
 *  Supports candlestick/line toggle, shows OHLC info on crosshair move,
 *  and automatically distinguishes incremental (last-candle) vs full data updates */
export const InteractiveChart = ({
  candles,
  scaleFactor = 1,
  splitMarkers = [],
  chartType,
  color,
  interval,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  className = '',
}: {
  candles: Candle[];
  scaleFactor?: number;
  splitMarkers?: { executedAt: number; splitRatio: number }[];
  chartType: 'candle' | 'line';
  color: string;
  interval: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  className?: string;
}) => {
  /** Current theme */
  const { theme } = useTheme();

  /** DOM container ref where the chart is mounted */
  const containerRef = useRef<HTMLDivElement>(null);
  /** lightweight-charts IChartApi instance ref */
  const chartRef = useRef<IChartApi | null>(null);
  /** Active series ref (candlestick or area) */
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | null>(null);
  /** Candle under crosshair, or last candle if not hovering */
  const [active, setActive] = useState<Candle | null>(null);
  /** Whether the crosshair is currently hovering */
  const [isHovering, setIsHovering] = useState(false);
  /** Ref holding the latest candles array for use inside the crosshair callback */
  const candlesRef = useRef(candles);
  /** Previous candles array used to determine if an update is incremental */
  const prevCandlesRef = useRef<Candle[]>([]);
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const previousVisibleFromRef = useRef<number | null>(null);
  const lastLoadMoreAtRef = useRef(0);
  /** Ref for initial theme at chart creation */
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  useEffect(() => { candlesRef.current = candles; }, [candles]);
  useEffect(() => { onLoadMoreRef.current = onLoadMore; }, [onLoadMore]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { isLoadingMoreRef.current = isLoadingMore; }, [isLoadingMore]);

  // Update chart colors when theme changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const c = chartColors[theme];
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: c.bg },
        textColor: c.text,
      },
      grid: {
        vertLines: { color: c.grid, style: LineStyle.Dashed },
        horzLines: { color: c.grid, style: LineStyle.Dashed },
      },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false },
    });
  }, [theme]);

  // Create chart instance and subscribe to crosshair events (once on mount)
  useEffect(() => {
    if (!containerRef.current) return;
    const c = chartColors[themeRef.current];
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: c.bg },
        textColor: c.text,
        fontFamily: 'monospace',
      },
      grid: {
        vertLines: { color: c.grid, style: LineStyle.Dashed },
        horzLines: { color: c.grid, style: LineStyle.Dashed },
      },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#3D8BFF', style: LineStyle.Dashed, width: 1 },
        horzLine: { color: '#3D8BFF', style: LineStyle.Dashed, width: 1 },
      },
    });
    chartRef.current = chart;
    let removeChartGestureGuards: (() => void) | null = null;
    const chartElement = containerRef.current.querySelector('.tv-lightweight-charts');
    if (chartElement instanceof HTMLElement) {
      chartElement.dataset.swipeIgnore = 'true';
      chartElement.style.touchAction = 'none';
      const stopChartGesturePropagation = (event: Event) => event.stopPropagation();
      const guardedEvents = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'];
      guardedEvents.forEach(eventName => {
        chartElement.addEventListener(eventName, stopChartGesturePropagation);
      });
      removeChartGestureGuards = () => {
        guardedEvents.forEach(eventName => {
          chartElement.removeEventListener(eventName, stopChartGesturePropagation);
        });
      };
    }

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

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      const previousFrom = previousVisibleFromRef.current;
      previousVisibleFromRef.current = range?.from ?? null;
      if (!range || !hasMoreRef.current || isLoadingMoreRef.current) return;
      if (previousFrom === null) return;

      const now = Date.now();
      const movedLeft = range.from < previousFrom;
      if (range.from <= 5 && movedLeft && now - lastLoadMoreAtRef.current > 500) {
        lastLoadMoreAtRef.current = now;
        onLoadMoreRef.current?.();
      }
    });

    return () => {
      removeChartGestureGuards?.();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Replace the series when chartType changes and apply current candle data
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) chart.removeSeries(seriesRef.current);

    const lineColor = color === '#FF5252' ? '#FF3B30' : '#007AFF';
    const priceFormat = scaleFactor > 1
      ? { type: 'custom' as const, formatter: (p: number) => formatScaledPrice(p, scaleFactor) }
      : { type: 'price' as const, precision: 0, minMove: 1 };
    if (chartType === 'candle') {
      seriesRef.current = chart.addCandlestickSeries({
        upColor: '#FF3B30', downColor: '#007AFF',
        borderUpColor: '#FF3B30', borderDownColor: '#007AFF',
        wickUpColor: '#FF3B30', wickDownColor: '#007AFF',
        priceFormat,
      });
    } else {
      seriesRef.current = chart.addAreaSeries({
        lineColor, topColor: lineColor + '40', bottomColor: lineColor + '00', lineWidth: 2,
        priceFormat,
      });
    }

    const current = candlesRef.current;
    if (current.length > 0) {
      applySeriesData(seriesRef.current, current, chartType);
      setActive(current[current.length - 1]);
    }
    prevCandlesRef.current = current;
  }, [chartType, scaleFactor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update area series color when color prop changes
  useEffect(() => {
    if (!seriesRef.current || chartType !== 'line') return;
    const lineColor = color === '#FF5252' ? '#FF3B30' : '#007AFF';
    (seriesRef.current as ISeriesApi<'Area'>).applyOptions({
      lineColor, topColor: lineColor + '40', bottomColor: lineColor + '00',
    });
  }, [color, chartType]);

  // Auto-detect incremental vs full update when candles change
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (candles.length === 0) { prevCandlesRef.current = []; return; }

    const prev = prevCandlesRef.current;
    /** Incremental if same start time and length grew by at most 1 */
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

  // Render split markers as annotations only; candle prices are already normalized by the API.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || candles.length === 0 || splitMarkers.length === 0) {
      seriesRef.current?.setMarkers?.([]);
      return;
    }
    const candleTimes = candles.map(c => Number(c.time));
    const markers = splitMarkers
      .map(e => {
        const targetSec = Math.floor(e.executedAt / 1000) + 9 * 3600;
        // Snap to the latest candle at or before the split time
        const before = candleTimes.filter(t => t <= targetSec);
        const nearest = before.length > 0
          ? before[before.length - 1]
          : candleTimes[0];
        return {
          time: nearest as UTCTimestamp,
          position: 'aboveBar' as const,
          color: '#F59E0B',
          shape: 'arrowDown' as const,
          text: `${e.splitRatio}:1`,
          size: 1,
        };
      })
      .sort((a, b) => Number(a.time) - Number(b.time));
    series.setMarkers?.(markers);
  }, [candles, splitMarkers]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayActive = active ?? (candles.length > 0 ? candles[candles.length - 1] : null);
  const isUp = displayActive ? displayActive.close >= displayActive.open : true;
  const activeColor = isUp ? '#FF3B30' : '#007AFF';

  return (
    <div className={`w-full flex flex-col gap-2 relative select-none ${className}`}>
      {/* OHLC info header based on crosshair position */}
      <div className="flex items-center gap-3 text-[11px] font-mono select-none px-1" style={{ color: 'var(--text-secondary)' }}>
        {displayActive ? (
          <>
            <span className="font-bold font-sans text-xs shrink-0" style={{ color: activeColor }}>
              {isUp ? '▲ 양봉' : '▼ 음봉'}
            </span>
            <div className="flex gap-2.5">
              <span>시<strong className="ml-1 text-[#FF3B30]">{formatScaledPrice(displayActive.open, scaleFactor)}</strong></span>
              <span>고<strong className="ml-1 text-[#FF3B30]">{formatScaledPrice(displayActive.high, scaleFactor)}</strong></span>
              <span>저<strong className="ml-1 text-[#007AFF]">{formatScaledPrice(displayActive.low, scaleFactor)}</strong></span>
              <span>종<strong className="ml-1" style={{ color: activeColor }}>{formatScaledPrice(displayActive.close, scaleFactor)}</strong></span>
            </div>
            {isHovering && (
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded"
                style={{ background: 'var(--bg-card)', color: 'var(--text-dim)' }}>
                {formatCandleTime(displayActive.time, interval)}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="font-bold font-sans text-xs shrink-0" style={{ color: 'var(--text-dim)' }}>○ 대기 중</span>
            <div className="flex gap-2.5" style={{ color: 'var(--text-dim)' }}>
              <span>시<strong className="ml-1" style={{ color: 'var(--text-dim)' }}>-</strong></span>
              <span>고<strong className="ml-1" style={{ color: 'var(--text-dim)' }}>-</strong></span>
              <span>저<strong className="ml-1" style={{ color: 'var(--text-dim)' }}>-</strong></span>
              <span>종<strong className="ml-1" style={{ color: 'var(--text-dim)' }}>-</strong></span>
            </div>
          </>
        )}
      </div>

      {/* Chart rendering area */}
      <div className="h-56 md:flex-1 md:min-h-0 relative w-full">
        <div
          ref={containerRef}
          className="w-full h-full rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--border-card)' }}
        />
        {/* Empty state placeholder for newly listed stocks */}
        {candles.length === 0 && (
          <div className="absolute inset-0 rounded-xl border flex flex-col items-center justify-center gap-2.5 p-6 text-center"
            style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-card)' }}>
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-lg border animate-pulse"
              style={{ background: 'var(--bg-card)', color: 'var(--text-dim)', borderColor: 'var(--border-primary)' }}>
              📊
            </div>
            <div>
              <div className="inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-accent-soft text-accent mb-1">
                신규 상장 종목
              </div>
              <h4 className="text-white text-xs font-bold mb-1">거래 내역이 존재하지 않습니다</h4>
              <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
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
