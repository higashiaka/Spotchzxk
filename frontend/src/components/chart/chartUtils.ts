import { UTCTimestamp, ISeriesApi } from 'lightweight-charts';

/** OHLC candlestick data passed to lightweight-charts */
export interface Candle {
  /** Candle reference time as UTCTimestamp */
  time: UTCTimestamp;
  /** Open price */
  open: number;
  /** High price */
  high: number;
  /** Low price */
  low: number;
  /** Close price */
  close: number;
}

/** Formats a candle timestamp to a readable string based on the selected interval */
export const formatCandleTime = (time: UTCTimestamp, interval: string): string => {
  const d = new Date(time * 1000);
  if (interval === '1m' || interval === '5m') {
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  } else if (interval === '1h') {
    return `${String(d.getUTCHours()).padStart(2, '0')}:00`;
  } else {
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  }
};

/** Applies an entire candle array to the series (used on initial load or interval change) */
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

/** Updates only the last candle in the series (used for real-time tick updates) */
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
