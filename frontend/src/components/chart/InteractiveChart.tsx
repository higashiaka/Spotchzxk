import { useState, useEffect, useRef } from 'react';
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  IChartApi, ISeriesApi, UTCTimestamp,
} from 'lightweight-charts';
import { Candle, formatCandleTime, applySeriesData, updateSeriesLast } from './chartUtils';
import { useTheme } from '../../contexts/ThemeContext';

/** 테마별 차트 색상 / Theme-specific chart colors */
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

/** lightweight-charts 기반 인터랙티브 차트 컴포넌트.
 *  봉차트/선차트 전환, 크로스헤어 이동 시 OHLC 정보 표시,
 *  증분 업데이트(마지막 캔들만 교체)와 전체 교체를 자동으로 구분
 *
 *  Interactive chart component built on lightweight-charts.
 *  Supports candlestick/line toggle, shows OHLC info on crosshair move,
 *  and automatically distinguishes incremental (last-candle) vs full data updates */
export const InteractiveChart = ({
  candles,
  chartType,
  color,
  interval,
}: {
  /** 렌더링할 캔들 데이터 배열 / Candlestick data array to render */
  candles: Candle[];
  /** 차트 타입 (봉차트 또는 선차트) / Chart type (candlestick or line) */
  chartType: 'candle' | 'line';
  /** 선차트 및 가격 방향 색상 / Color used for line chart and price direction */
  color: string;
  /** 현재 선택된 인터벌 (시간 포맷에 사용) / Currently selected interval (used for time formatting) */
  interval: string;
}) => {
  /** 현재 테마 / Current theme */
  const { theme } = useTheme();

  /** 차트가 마운트될 DOM 컨테이너 ref / DOM container ref where the chart is mounted */
  const containerRef = useRef<HTMLDivElement>(null);
  /** lightweight-charts IChartApi 인스턴스 ref / lightweight-charts IChartApi instance ref */
  const chartRef = useRef<IChartApi | null>(null);
  /** 현재 활성 시리즈 ref (봉 or 선) / Active series ref (candlestick or area) */
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | null>(null);
  /** 크로스헤어가 올려진 캔들 (없으면 마지막 캔들) / Candle under crosshair, or last candle if not hovering */
  const [active, setActive] = useState<Candle | null>(null);
  /** 크로스헤어 호버 여부 / Whether the crosshair is currently hovering */
  const [isHovering, setIsHovering] = useState(false);
  /** 크로스헤어 핸들러 내부에서 최신 캔들 배열을 참조하기 위한 ref
   *  Ref holding the latest candles array for use inside the crosshair callback */
  const candlesRef = useRef(candles);
  /** 이전 렌더링 시점의 캔들 배열 (증분 업데이트 판별용)
   *  Previous candles array used to determine if an update is incremental */
  const prevCandlesRef = useRef<Candle[]>([]);
  /** 차트 생성 시 초기 테마를 참조하기 위한 ref / Ref for initial theme at chart creation */
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  useEffect(() => { candlesRef.current = candles; }, [candles]);

  // 테마 변경 시 차트 색상 업데이트 / Update chart colors when theme changes
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

  // 차트 인스턴스 생성 및 크로스헤어 이벤트 구독 (마운트 시 1회)
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

  // chartType 변경 시 시리즈를 교체하고 현재 캔들 데이터를 적용
  // Replace the series when chartType changes and apply current candle data
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

  // 선차트 색상 변경 시 시리즈 옵션 갱신 / Update area series color when color prop changes
  useEffect(() => {
    if (!seriesRef.current || chartType !== 'line') return;
    const lineColor = color === '#FF5252' ? '#FF3B30' : '#007AFF';
    (seriesRef.current as ISeriesApi<'Area'>).applyOptions({
      lineColor, topColor: lineColor + '40', bottomColor: lineColor + '00',
    });
  }, [color, chartType]);

  // 캔들 배열 변경 시 증분/전체 업데이트 자동 판별
  // Auto-detect incremental vs full update when candles change
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (candles.length === 0) { prevCandlesRef.current = []; return; }

    const prev = prevCandlesRef.current;
    /** 증분 업데이트 조건: 시작 시간이 같고 길이가 최대 1 증가
     *  Incremental if same start time and length grew by at most 1 */
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
      {/* OHLC 정보 헤더 (크로스헤어 위치 기준) / OHLC info header based on crosshair position */}
      <div className="flex items-center gap-3 text-[11px] font-mono select-none px-1" style={{ color: 'var(--text-secondary)' }}>
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

      {/* 차트 렌더링 영역 / Chart rendering area */}
      <div className="h-56 md:h-[470px] relative w-full">
        <div ref={containerRef} className="w-full h-full rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--border-card)' }} />
        {/* 데이터 없음 플레이스홀더 (신규 상장 종목) / Empty state placeholder for newly listed stocks */}
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
