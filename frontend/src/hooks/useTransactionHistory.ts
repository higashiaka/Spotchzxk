import { useQuery } from '@tanstack/react-query';
import { db } from '../firebase';
import { collection, query, getDocs } from 'firebase/firestore';

export interface OrderHistory {
  id: string;
  streamerId: string;
  type: 'buy' | 'sell';
  quantity: number;
  executedPrice?: number;
  estimatedPrice: number;
  timestamp: number;
  status: string;
}

export const useTransactionHistory = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['history', userId],
    queryFn: async (): Promise<OrderHistory[]> => {
      if (!userId) return [];
      
      const q = query(
        collection(db, 'portfolios', userId, 'orders')
      );
      
      const snap = await getDocs(q);
      const orders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrderHistory));
      
      // Sort client-side by timestamp descending rapidly bypassing indexing needs
      return orders.sort((a, b) => b.timestamp - a.timestamp).slice(0, 15);
    },
    enabled: !!userId,
    // Polling intelligently overlaps against backend cycles delivering final transaction updates flawlessly!
    refetchInterval: 4000, 
  });
};
