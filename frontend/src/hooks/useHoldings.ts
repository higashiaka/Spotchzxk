import { useMemo } from 'react';
import { Stock } from './useStocks';

/** Aggregated data for a single holding position */
export interface HoldingItem {
  /** Corresponding streamer stock data */
  streamer: Stock;
  /** Held quantity */
  qty: number;
  /** Market value (current price × quantity) */
  value: number;
  /** Return rate vs average purchase price in % */
  pct: number;
  /** Average purchase price */
  avgPrice: number;
}

/** Hook that derives holding items and total holding count from a portfolio.
 *  Sorted by market value descending; optional limit returns top N items
 *
 *  @param portfolio - Portfolio object with balance, shares, avgPrices
 *  @param streamers - Current stock list used for price lookup
 *  @param options.limit - Max number of holdings to return
 */
export const useHoldings = (
  portfolio: any,
  streamers: Stock[],
  options: { limit?: number } = {},
) => {
  const { limit } = options;

  /** Holding items sorted by market value descending */
  const holdings = useMemo(() => {
    if (!portfolio?.shares) return [];

    const byId = new Map(streamers.map(stock => [stock.id, stock]));

    const items = Object.entries(portfolio.shares as Record<string, string>)
      .map(([id, rawQty]) => [id, Number(rawQty)] as const)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const streamer = byId.get(id);
        if (!streamer) return null;

        const avgPrice = Number(portfolio.avgPrices?.[id] ?? 0);
        const pct = avgPrice > 0 ? ((streamer.price - avgPrice) / avgPrice) * 100 : 0;
        return { streamer, qty, value: streamer.price * qty, pct, avgPrice };
      })
      .filter(Boolean)
      .sort((a, b) => b!.value - a!.value) as HoldingItem[];

    return typeof limit === 'number' ? items.slice(0, limit) : items;
  }, [limit, portfolio, streamers]);

  /** Total count of stocks held with quantity > 0 */
  const holdingCount = useMemo(
    () => Object.values(portfolio?.shares as Record<string, string> ?? {}).filter(q => Number(q) > 0).length,
    [portfolio],
  );

  return { holdings, holdingCount };
};
