import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { subscribeStomp } from '../lib/stompClient';
import { OrderHistory } from './useTransactionHistory';

/** 미체결 주문 목록 조회 및 취소 기능을 제공하는 훅.
 *  3초 간격 폴링 + STOMP 실시간 알림으로 체결/취소 이벤트를 즉시 반영
 *
 *  Hook that provides pending order list and cancel functionality.
 *  Combines 3s polling with STOMP real-time notifications for instant updates on execution/cancel */
export const usePendingOrders = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  /** 전체 주문 내역 조회 (미체결 필터링 기반)
   *  Fetches all orders; pending orders are derived by filtering this result */
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

  /** STOMP /topic/orders/{userId} 구독: 지정가 체결·취소 시 캐시 즉시 무효화
   *  Subscribes to STOMP /topic/orders/{userId}; invalidates caches immediately on execution/cancel */
  useEffect(() => {
    if (!userId) return;
    const sub = subscribeStomp(`/topic/orders/${userId}`, () => {
      queryClient.invalidateQueries({ queryKey: ['history', userId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
    });
    return () => sub.unsubscribe();
  }, [userId, queryClient]);

  /** status === 'pending' 인 주문만 필터링
   *  Orders filtered to only include pending (unexecuted) status */
  const pendingOrders = allOrders ? allOrders.filter(o => o.status === 'pending') : [];

  /** 지정가 주문 취소 mutation. 성공 시 주문·포트폴리오 캐시 갱신
   *  Limit order cancel mutation; invalidates order and portfolio caches on success */
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
    /** status가 'pending'인 미체결 주문 목록 / List of unexecuted orders with status 'pending' */
    pendingOrders,
    /** 데이터 로딩 여부 / Whether data is currently loading */
    isLoading,
    /** 주문 취소 함수 (orderId를 인자로 받음) / Cancel function; takes orderId as argument */
    cancelOrder: cancelMutation.mutate,
    /** 취소 요청 처리 중 여부 / Whether a cancel request is in progress */
    isCancelling: cancelMutation.isPending,
    /** 수동 재조회 함수 / Manual refetch function */
    refetch,
  };
};
