import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

/** 개별 주문/거래 내역 항목
 *  A single order or transaction history entry */
export interface OrderHistory {
  /** 주문 고유 ID / Unique order ID */
  id: string;
  /** 주문 대상 스트리머 채널 ID / Target streamer channel ID */
  streamerId: string;
  /** 주문 방향 (매수/매도) / Order direction (buy or sell) */
  type: 'buy' | 'sell';
  /** 주문 수량 / Ordered quantity */
  quantity: number;
  /** 실제 체결 가격 (체결된 경우에만 존재) / Actual execution price, present only if executed */
  executedPrice?: number;
  /** 주문 당시 예상 체결가 / Estimated price at the time of order */
  estimatedPrice: number;
  /** 지정가 주문의 지정 가격 / Limit price for limit orders */
  limitPrice?: number;
  /** 주문 유형 (시장가/지정가) / Order mode (market or limit) */
  orderMode?: 'market' | 'limit';
  /** 주문 생성 시각 (Unix ms) / Order creation timestamp in Unix ms */
  createdAt: number;
  /** 주문 상태 (예: pending, executed, cancelled) / Order status (e.g. pending, executed, cancelled) */
  status: string;
}

/** 사용자 주문/거래 내역을 4초 간격으로 폴링하는 React Query 훅.
 *  userId가 없으면 쿼리를 실행하지 않음
 *
 *  React Query hook that polls the user's order history every 4 seconds.
 *  Query is disabled when userId is falsy */
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
