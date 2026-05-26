import { useMemo } from 'react';
import { DEFAULT_STOCKS, Stock } from './useStocks';

/** 보유 종목 1건의 집계 데이터
 *  Aggregated data for a single holding position */
export interface HoldingItem {
  /** 해당 스트리머 종목 정보 / Corresponding streamer stock data */
  streamer: Stock;
  /** 보유 수량 / Held quantity */
  qty: number;
  /** 평가 금액 (현재가 × 수량) / Market value (current price × quantity) */
  value: number;
  /** 평단가 대비 수익률 (%) / Return rate vs average purchase price in % */
  pct: number;
  /** 평균 매입 단가 / Average purchase price */
  avgPrice: number;
}

/** 포트폴리오에서 보유 종목 목록과 보유 종목 수를 계산하는 훅.
 *  종목을 평가금액 내림차순으로 정렬하며, limit으로 상위 N개만 반환 가능
 *
 *  Hook that derives holding items and total holding count from a portfolio.
 *  Sorted by market value descending; optional limit returns top N items
 *
 *  @param portfolio - 포트폴리오 객체 (잔고·보유주식·평단가 포함) / Portfolio object with balance, shares, avgPrices
 *  @param streamers - 현재 종목 목록 (가격 조회용) / Current stock list used for price lookup
 *  @param options.limit - 반환할 최대 보유 종목 수 / Max number of holdings to return
 *  @param options.includeDefaults - DEFAULT_STOCKS를 소스에 포함할지 여부 / Whether to include DEFAULT_STOCKS in source */
export const useHoldings = (
  portfolio: any,
  streamers: Stock[],
  options: { limit?: number; includeDefaults?: boolean } = {},
) => {
  const { limit, includeDefaults = false } = options;

  /** 보유 종목 배열 (평가금액 내림차순)
   *  Holding items sorted by market value descending */
  const holdings = useMemo(() => {
    if (!portfolio?.shares) return [];

    const source = includeDefaults ? [...streamers, ...DEFAULT_STOCKS] : streamers;
    const byId = new Map(source.map(stock => [stock.id, stock]));

    const items = Object.entries(portfolio.shares as Record<string, number>)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const streamer = byId.get(id);
        if (!streamer) return null;

        const avgPrice = portfolio.avgPrices?.[id] ?? 0;
        const pct = avgPrice > 0 ? ((streamer.price - avgPrice) / avgPrice) * 100 : 0;
        return { streamer, qty, value: streamer.price * qty, pct, avgPrice };
      })
      .filter(Boolean)
      .sort((a, b) => b!.value - a!.value) as HoldingItem[];

    return typeof limit === 'number' ? items.slice(0, limit) : items;
  }, [includeDefaults, limit, portfolio, streamers]);

  /** 수량이 1 이상인 보유 종목의 총 수
   *  Total count of stocks held with quantity > 0 */
  const holdingCount = useMemo(
    () => Object.values(portfolio?.shares as Record<string, number> ?? {}).filter(q => q > 0).length,
    [portfolio],
  );

  return { holdings, holdingCount };
};
