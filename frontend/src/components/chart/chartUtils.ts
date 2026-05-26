import { UTCTimestamp, ISeriesApi } from 'lightweight-charts';

/** lightweight-charts에 전달하는 OHLC 캔들 데이터
 *  OHLC candlestick data passed to lightweight-charts */
export interface Candle {
  /** 캔들 기준 시각 (UTCTimestamp) / Candle reference time as UTCTimestamp */
  time: UTCTimestamp;
  /** 시가 / Open price */
  open: number;
  /** 고가 / High price */
  high: number;
  /** 저가 / Low price */
  low: number;
  /** 종가 / Close price */
  close: number;
}

/** 인터벌에 따라 캔들 시각을 읽기 쉬운 문자열로 변환
 *  Formats a candle timestamp to a readable string based on the selected interval */
export const formatCandleTime = (time: UTCTimestamp, interval: string): string => {
  const d = new Date(time * 1000);
  if (interval === '1m' || interval === '5m') {
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  } else if (interval === '1h') {
    return `${String(d.getUTCHours()).padStart(2, '0')}:00`;
  } else {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
};

/** 캔들 배열 전체를 시리즈에 적용 (초기 로드 또는 인터벌 변경 시)
 *  Applies an entire candle array to the series (used on initial load or interval change) */
export function applySeriesData(
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

/** 시리즈의 마지막 캔들 하나를 업데이트 (실시간 tick 처리)
 *  Updates only the last candle in the series (used for real-time tick updates) */
export function updateSeriesLast(
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
