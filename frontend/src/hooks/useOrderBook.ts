import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { subscribeStomp } from '../lib/stompClient';

export interface OrderBookLevel {
  price: string;
  quantity: string;
}

export interface OrderBook {
  streamerId: string;
  currentPrice: string;
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
}

export const useOrderBook = (streamerId: string | undefined) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!streamerId) return;
    const sub = subscribeStomp(`/topic/order-book/${streamerId}`, () => {
      queryClient.invalidateQueries({ queryKey: ['order-book', streamerId] });
    });
    return () => sub.unsubscribe();
  }, [streamerId, queryClient]);

  return useQuery<OrderBook>({
    queryKey: ['order-book', streamerId],
    queryFn: async () => {
      if (!streamerId) {
        return { streamerId: '', currentPrice: '0', asks: [], bids: [] };
      }
      const res = await apiFetch(`/api/stocks/${encodeURIComponent(streamerId)}/order-book?depth=10`);
      if (!res.ok) throw new Error('Failed to load order book');
      return res.json();
    },
    enabled: !!streamerId,
  });
};
