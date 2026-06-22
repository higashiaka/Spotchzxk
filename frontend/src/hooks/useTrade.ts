import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Portfolio } from './usePortfolio';
import { apiFetch } from '../lib/api';

const parseIntegerAmount = (value: number | string | undefined): bigint => {
  if (value === undefined) return 0n;
  const raw = String(value);
  const normalized = raw.includes('e') || raw.includes('E') ? Number(value).toFixed(0) : raw;
  const integerPart = normalized.replace(/[^\d.]/g, '').split('.')[0];
  return integerPart ? BigInt(integerPart) : 0n;
};

/** Parameters required to submit a trade order */
export interface TradeDetails {
  /** Target streamer channel ID */
  streamerId: string;
  /** Order direction (buy or sell) */
  type: 'buy' | 'sell';
  /** Order quantity */
  quantity: number | string;
  /** Estimated execution price at the time of order */
  estimatedPrice: number;
  estimatedExecutionPrice?: number;
  /** Estimated total amount including AMM slippage and fees */
  estimatedTotalAmount?: number | string;
  orderMode?: 'market' | 'limit';
  limitPrice?: number;
  maxCoinIn?: number;
  minCoinOut?: number;
}

/** Trade mutation hook with optimistic update.
 *  Immediately updates the portfolio cache, then re-validates
 *  after a short delay (3.5s) following the server response */
export const useTrade = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    /** Sends the order to the server and returns the response */
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

    /** Optimistically updates the portfolio cache before the server responds */
    onMutate: async (newTrade: TradeDetails) => {
      await queryClient.cancelQueries({ queryKey: ['portfolio', userId] });
      await queryClient.cancelQueries({ queryKey: ['history', userId] });
      const previousPortfolio = queryClient.getQueryData<Portfolio>(['portfolio', userId]);

      queryClient.setQueryData<Partial<Portfolio>>(['portfolio', userId], (old) => {
        const state = old || { balance: '10000000', shares: {} };
        const newShares: Record<string, number> = { ...state.shares };
        const estimatedAmount = newTrade.estimatedTotalAmount !== undefined
          ? parseIntegerAmount(newTrade.estimatedTotalAmount)
          : parseIntegerAmount((newTrade.limitPrice ?? newTrade.estimatedExecutionPrice ?? newTrade.estimatedPrice) * Number(newTrade.quantity));
        let newBalance = parseIntegerAmount(state.balance ?? '10000000');

        if (newTrade.type === 'buy') {
          newBalance -= estimatedAmount;
          if (newTrade.orderMode !== 'limit') {
            newShares[newTrade.streamerId] = Number(newShares[newTrade.streamerId] || 0) + Number(newTrade.quantity);
          }
        } else {
          if (newTrade.orderMode !== 'limit') {
            newBalance += estimatedAmount;
            newShares[newTrade.streamerId] = Math.max(0, (newShares[newTrade.streamerId] || 0) - Number(newTrade.quantity));
          }
        }

        return { ...state, balance: newBalance.toString(), shares: newShares };
      });

      return { previousPortfolio };
    },

    /** Applies the server's actual balance immediately after a successful trade */
    onSuccess: (data) => {
      if (data?.newBalance !== undefined) {
        queryClient.setQueryData<Portfolio>(['portfolio', userId], (old) =>
          old ? { ...old, balance: String(data.newBalance) } : old
        );
      }
      queryClient.invalidateQueries({ queryKey: ['history', userId] });
    },

    /** Rolls back the optimistic update and alerts the user on error */
    onError: (err: Error, _newTrade: TradeDetails, context?: { previousPortfolio?: Portfolio }) => {
      if (context?.previousPortfolio) {
        queryClient.setQueryData<Portfolio>(['portfolio', userId], context.previousPortfolio);
      }
      alert(err.message);
    },

    /** After settle (success or error): re-validates portfolio cache after 3.5s */
    onSettled: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
        queryClient.invalidateQueries({ queryKey: ['history', userId] });
      }, 3500);
    },
  });
};
