/** Normalized shape of a streamer/stock, sourced from REST and STOMP responses */
export interface Stock {
  /** Chzzk channel ID used as primary key */
  id: string;
  /** Streamer display name */
  name: string;
  /** Current stock price in KRW */
  price: number;
  /** Daily cumulative trading volume */
  totalVolume: number;
  /** Daily cumulative trading value in KRW (sum of executedPrice × quantity per trade) */
  dailyTradingValue: number;
  /** Base price used for return calculation */
  basePrice?: number;
  /** Number of followers */
  followers?: number;
  /** Listing price used for AMM rebalance threshold */
  listingPrice?: number;
  /** Profile image URL */
  profileImageUrl?: string;
  /** Whether the streamer is currently live */
  isLive?: boolean;
  /** Total issued share count */
  totalSupply?: number;
  /** Base broadcast hours for dividend calculation */
  baseBroadcastHours?: number;
  /** Live start time in ISO 8601 */
  liveStartedAt?: string;
  /** Accumulated dividend count in the current live session */
  dividendAccumulationCount?: number;
  /** Float supply before live started */
  preStreamFloat?: number;
  /** AMM coin reserve used for client-side market order estimates */
  coinReserve?: string;
  /** AMM share reserve used for client-side market order estimates */
  shareReserve?: string;
  /** Listing date in ISO 8601 */
  listedAt?: string;
}

/** Default empty stock list; actual data is fetched from the backend API */
export const DEFAULT_STOCKS: Stock[] = [];
