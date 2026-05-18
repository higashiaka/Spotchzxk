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
      // Instead of writing a 'pending' state identically into Firestore (which wastes a write quota),
      // we fire it instantaneously into our node.js server's RAM buffer.
      const res = await apiFetch('/api/trade', {
        method: 'POST',
        body: JSON.stringify({ userId, ...tradeDetails }),
      });
      
      if (!res.ok) {
        throw new Error('Trade failed to queue on server');
      }
      return res.json();
    },
    
    onMutate: async (newTrade: TradeDetails) => {
      await queryClient.cancelQueries({ queryKey: ['portfolio', userId] });
      const previousPortfolio = queryClient.getQueryData<Portfolio>(['portfolio', userId]);

      queryClient.setQueryData<Partial<Portfolio>>(['portfolio', userId], (old) => {
        const PRICE_IMPACT_FACTOR = 0.0005;
        const isBuy = newTrade.type === 'buy';
        const u  = isBuy ? 1 + PRICE_IMPACT_FACTOR : 1 - PRICE_IMPACT_FACTOR;
        const fm = Math.pow(u, newTrade.quantity);
        const cost = Math.max(0, newTrade.estimatedPrice * (isBuy
          ? u * (fm - 1) / PRICE_IMPACT_FACTOR
          : u * (1 - fm) / PRICE_IMPACT_FACTOR));
        
        const state = old || { balance: 10000000, shares: {} };
        const newShares: Record<string, number> = { ...state.shares };
        let newBalance = state.balance ?? 10000000;

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
    
    onError: (err: Error, newTrade: TradeDetails, context?: { previousPortfolio?: Portfolio }) => {
      console.error('Optimistic UI Rollback due to error:', err);
      if (context?.previousPortfolio) {
        queryClient.setQueryData<Portfolio>(['portfolio', userId], context.previousPortfolio);
      }
      alert(`Trade failed: ${err.message}. Rolling back.`);
    },
    
    onSettled: () => {
      // Padded to align to the 3-second cycle length so UI refetches actual balance properly
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
      }, 3500); 
    },
  });
};
