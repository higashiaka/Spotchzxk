// 차트에서 사용하는 기간, OHLC 데이터 변환 유틸리티입니다.
import { UTCTimestamp, ISeriesApi } from 'lightweight-charts';

export interface Candle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

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
