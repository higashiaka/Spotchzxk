import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Portfolio } from './usePortfolio';
import { apiFetch } from '../lib/api';

/** 주문 요청 시 필요한 파라미터
 *  Parameters required to submit a trade order */
export interface TradeDetails {
  /** 주문 대상 스트리머 채널 ID / Target streamer channel ID */
  streamerId: string;
  /** 주문 방향 (매수/매도) / Order direction (buy or sell) */
  type: 'buy' | 'sell';
  /** 주문 수량 / Order quantity */
  quantity: number;
  /** 주문 시점의 예상 체결가 / Estimated execution price at the time of order */
  estimatedPrice: number;
  orderMode?: 'market' | 'limit';
  limitPrice?: number;
}

/** 주문 요청 mutation 훅.
 *  낙관적 업데이트로 포트폴리오 캐시를 즉시 반영하고,
 *  서버 응답 후 일정 시간(3.5s) 지연 후 캐시를 재검증
 *
 *  Trade mutation hook with optimistic update.
 *  Immediately updates the portfolio cache, then re-validates
 *  after a short delay (3.5s) following the server response */
export const useTrade = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    /** 서버에 주문을 전송하고 응답을 반환 / Sends the order to the server and returns the response */
    mutationFn: async (tradeDetails: TradeDetails) => {
      const res = await apiFetch('/api/trade', {
        method: 'POST',
        body: JSON.stringify({ userId, ...tradeDetails }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '주문 처리에 실패했습니다.');
      }
      return res.json();
    },

    /** 서버 응답 전 포트폴리오 캐시를 낙관적으로 업데이트
     *  Optimistically updates the portfolio cache before the server responds */
    onMutate: async (newTrade: TradeDetails) => {
      if (newTrade.orderMode === 'limit') {
        return {};
      }

      await queryClient.cancelQueries({ queryKey: ['portfolio', userId] });
      const previousPortfolio = queryClient.getQueryData<Portfolio>(['portfolio', userId]);

      queryClient.setQueryData<Partial<Portfolio>>(['portfolio', userId], (old) => {
        const cost = newTrade.estimatedPrice * newTrade.quantity;
        const state = old || { balance: 1000000, shares: {} };
        const newShares: Record<string, number> = { ...state.shares };
        let newBalance = state.balance ?? 1000000;

        if (newTrade.type === 'buy') {
          newBalance -= cost;
          newShares[newTrade.streamerId] = (newShares[newTrade.streamerId] || 0) + newTrade.quantity;
        } else {
          newBalance += cost;
          newShares[newTrade.streamerId] = Math.max(0, (newShares[newTrade.streamerId] || 0) - newTrade.quantity);
        }

        return { ...state, balance: newBalance, shares: newShares };
      });

      return { previousPortfolio };
    },

    /** 주문 실패 시 낙관적 업데이트를 롤백하고 에러 알림
     *  Rolls back the optimistic update and alerts the user on error */
    onError: (err: Error, _newTrade: TradeDetails, context?: { previousPortfolio?: Portfolio }) => {
      if (context?.previousPortfolio) {
        queryClient.setQueryData<Portfolio>(['portfolio', userId], context.previousPortfolio);
      }
      alert(err.message);
    },

    /** 성공/실패 공통 처리: 3.5초 후 포트폴리오 캐시 재검증
     *  After settle (success or error): re-validates portfolio cache after 3.5s */
    onSettled: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
        queryClient.invalidateQueries({ queryKey: ['history', userId] });
      }, 3500);
    },
  });
};
