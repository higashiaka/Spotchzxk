// 주문 요청을 서버에 보내고 관련 React Query 캐시를 갱신합니다.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Portfolio } from './usePortfolio';
import { apiFetch } from '../lib/api';

export interface TradeDetails {
  streamerId: string;
  type: 'buy' | 'sell';
  quantity: number;
  estimatedPrice: number;
}

export const useTrade = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
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

    onMutate: async (newTrade: TradeDetails) => {
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

    onError: (err: Error, _newTrade: TradeDetails, context?: { previousPortfolio?: Portfolio }) => {
      if (context?.previousPortfolio) {
        queryClient.setQueryData<Portfolio>(['portfolio', userId], context.previousPortfolio);
      }
      alert(err.message);
    },

    onSettled: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
      }, 3500);
    },
  });
};
