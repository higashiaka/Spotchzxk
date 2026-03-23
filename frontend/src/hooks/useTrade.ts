import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Portfolio } from './usePortfolio';

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
      const res = await fetch('http://localhost:3000/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        const cost = newTrade.estimatedPrice * newTrade.quantity;
        const state = old || { balance: 10000, shares: {} };
        const newShares: Record<string, number> = { ...state.shares };
        let newBalance = state.balance || 10000;

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
