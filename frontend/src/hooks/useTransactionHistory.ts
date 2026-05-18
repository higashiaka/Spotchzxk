import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export interface OrderHistory {
  id: string;
  streamerId: string;
  type: 'buy' | 'sell';
  quantity: number;
  executedPrice?: number;
  estimatedPrice: number;
  createdAt: number;
  status: string;
}

export const useTransactionHistory = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['history', userId],
    queryFn: async (): Promise<OrderHistory[]> => {
      if (!userId) return [];
      const res = await apiFetch('/api/orders');
      if (!res.ok) throw new Error('주문 내역 조회 실패');
      return res.json();
    },
    enabled: !!userId,
    refetchInterval: 4000,
  });
};
