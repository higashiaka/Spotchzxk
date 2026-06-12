import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { subscribeStomp } from '@/lib/stompClient';
import { OrderHistory, sortOrdersNewestFirst } from './useTransactionHistory';

/** Hook that provides pending order list and cancel functionality.
 *  Combines 3s polling with STOMP real-time notifications for instant updates on execution/cancel */
export const usePendingOrders = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  /** Fetches all orders; pending orders are derived by filtering this result */
  const { data: allOrders, isLoading, refetch } = useQuery<OrderHistory[]>({
    queryKey: ['history', userId],
    queryFn: async (): Promise<OrderHistory[]> => {
      if (!userId) return [];
      const res = await apiFetch('/api/orders');
      if (!res.ok) throw new Error('주문 내역 조회 실패');
      const orders = await res.json();
      return sortOrdersNewestFirst(orders);
    },
    enabled: !!userId,
    refetchInterval: 3000,
  });

  /** Subscribes to STOMP /topic/orders/{userId}; invalidates caches immediately on execution/cancel */
  useEffect(() => {
    if (!userId) return;
    const sub = subscribeStomp(`/topic/orders/${userId}`, () => {
      queryClient.invalidateQueries({ queryKey: ['history', userId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
    });
    return () => sub.unsubscribe();
  }, [userId, queryClient]);

  /** Orders filtered to only include pending (unexecuted) status */
  const pendingOrders = allOrders ? allOrders.filter(o => o.status === 'pending') : [];

  /** Limit order cancel mutation; invalidates order and portfolio caches on success */
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
      queryClient.invalidateQueries({ queryKey: ['history', userId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
    },
    onError: (err: any) => {
      alert(`주문 취소 오류: ${err.message}`);
    }
  });

  return {
    /** List of unexecuted orders with status 'pending' */
    pendingOrders,
    /** Whether data is currently loading */
    isLoading,
    /** Cancel function; takes orderId as argument */
    cancelOrder: cancelMutation.mutate,
    /** Whether a cancel request is in progress */
    isCancelling: cancelMutation.isPending,
    /** Manual refetch function */
    refetch,
  };
};
