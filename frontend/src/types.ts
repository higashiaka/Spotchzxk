export type AppTab = 'home' | 'prices' | 'order' | 'chart' | 'profile';

export interface LiveTrade {
  streamerId: string;
  streamerName: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: number;
}
