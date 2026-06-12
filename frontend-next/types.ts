/** Tab identifiers used across the entire app */
export type AppTab = 'home' | 'prices' | 'order' | 'chart' | 'rankings' | 'profile' | 'shop' | 'holdings' | 'settings' | 'guide' | 'announcements';

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
  quantity: number;
  /** Executed price */
  price: number;
  /** Executed trading value */
  tradingValue?: number;
  /** Updated AMM coin reserve after the trade */
  coinReserve?: string;
  /** Updated AMM share reserve after the trade */
  shareReserve?: string;
  /** Execution timestamp in Unix ms */
  timestamp: number;
}
