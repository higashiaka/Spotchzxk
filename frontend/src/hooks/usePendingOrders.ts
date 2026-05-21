import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { subscribeStomp } from '../lib/stompClient';
import { OrderHistory } from './useTransactionHistory';

export const usePendingOrders = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  // 사용자의 미체결 주문 조회 (거래 내역 쿼리를 기반으로 필터링)
  const { data: allOrders, isLoading, refetch } = useQuery<OrderHistory[]>({
    queryKey: ['history', userId],
    queryFn: async (): Promise<OrderHistory[]> => {
      if (!userId) return [];
      const res = await apiFetch('/api/orders');
      if (!res.ok) throw new Error('주문 내역 조회 실패');
      return res.json();
    },
    enabled: !!userId,
    refetchInterval: 3000,
  });

  // 실시간 체결 알림 — 지정가 주문이 체결/취소되면 즉시 갱신
  useEffect(() => {
    if (!userId) return;
    const sub = subscribeStomp(`/topic/orders/${userId}`, () => {
      queryClient.invalidateQueries({ queryKey: ['history', userId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
    });
    return () => sub.unsubscribe();
  }, [userId, queryClient]);

  const pendingOrders = allOrders ? allOrders.filter(o => o.status === 'pending') : [];

  // 주문 취소 mutation
  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiFetch(`/api/trade/cancel?orderId=${orderId}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || '주문 취소 실패');
      }
      return res.json();
    },
    onSuccess: () => {
      // 캐시 갱신
      queryClient.invalidateQueries({ queryKey: ['history', userId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
    },
    onError: (err: any) => {
      alert(`주문 취소 오류: ${err.message}`);
    }
  });

  return {
    pendingOrders,
    isLoading,
    cancelOrder: cancelMutation.mutate,
    isCancelling: cancelMutation.isPending,
    refetch,
  };
};
