/** Tab identifiers used across the entire app */
export type AppTab = 'home' | 'prices' | 'order' | 'chart' | 'rankings' | 'profile' | 'shop' | 'holdings' | 'settings' | 'guide' | 'announcements' | 'feedback';

/** Live trade event received via STOMP WebSocket */
export interface LiveTrade {
  id?: string;
  /** Streamer channel ID */
  streamerId: string;
  /** Streamer display name */
  streamerName: string;
  /** Buy or sell direction */
  type: 'buy' | 'sell';
  /** Executed quantity */
  quantity: number | string;
  /** Executed price */
  price: number | string;
  /** Executed trading value */
  tradingValue?: number;
  /** Server-authoritative daily cumulative trading volume after this trade */
  dailyVolume?: number | string;
  /** Server-authoritative daily cumulative trading value after this trade */
  dailyTradingValue?: number | string;
  /** Updated AMM coin reserve after the trade */
  coinReserve?: string;
  /** Updated AMM share reserve after the trade */
  shareReserve?: string;
  /** Execution timestamp in Unix ms */
  timestamp: number;
  /** Whether trading was suspended as a result of this trade (e.g. price below 1 won) */
  tradingSuspended?: boolean;
  /** Reason for current trading suspension, null when trading is active */
  tradingSuspensionReason?: 'API_UNAVAILABLE' | 'PRICE_BELOW_ONE' | 'INVALID_AMM_POOL' | string | null;
}
