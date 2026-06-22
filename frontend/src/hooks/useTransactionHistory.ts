import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

/** A single order or transaction history entry */
export interface OrderHistory {
  /** Unique order ID */
  id: string;
  /** Target streamer channel ID */
  streamerId: string;
  /** Order direction (buy or sell) */
  type: 'buy' | 'sell';
  /** Ordered quantity */
  quantity: string;
  /** Actual execution price, present only if executed */
  executedPrice?: string;
  /** Estimated price at the time of order */
  estimatedPrice: string;
  /** Limit price for limit orders */
  limitPrice?: string;
  /** Order mode (market or limit) */
  orderMode?: 'market' | 'limit';
  /** Order creation timestamp in Unix ms */
  createdAt: number;
  /** Order status (e.g. pending, executed, cancelled) */
  status: string;
}

export const sortOrdersNewestFirst = (orders: OrderHistory[]): OrderHistory[] =>
  [...orders].sort((a, b) => b.createdAt - a.createdAt);

/** React Query hook that polls the user's order history every 4 seconds.
 *  Query is disabled when userId is falsy */
export const useTransactionHistory = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['history', userId],
    queryFn: async (): Promise<OrderHistory[]> => {
      if (!userId) return [];
      const res = await apiFetch('/api/orders');
      if (!res.ok) throw new Error('주문 내역 조회 실패');
      const orders = await res.json();
      return sortOrdersNewestFirst(orders);
    },
    enabled: !!userId,
    refetchInterval: 4000,
  });
};
