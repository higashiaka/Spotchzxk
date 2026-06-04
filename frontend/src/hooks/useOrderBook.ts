import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBook {
  streamerId: string;
  currentPrice: number;
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
}

export const useOrderBook = (streamerId: string | undefined) => {
  return useQuery<OrderBook>({
    queryKey: ['order-book', streamerId],
    queryFn: async () => {
      if (!streamerId) {
        return { streamerId: '', currentPrice: 0, asks: [], bids: [] };
      }
      const res = await apiFetch(`/api/stocks/${encodeURIComponent(streamerId)}/order-book?depth=10`);
      if (!res.ok) throw new Error('Failed to load order book');
      return res.json();
    },
    enabled: !!streamerId,
    refetchInterval: 2000,
  });
};
