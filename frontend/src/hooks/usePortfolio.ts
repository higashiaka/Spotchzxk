import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface Portfolio {
  balance: number;
  shares: Record<string, number>;
}

export const usePortfolio = (userId: string | undefined): UseQueryResult<Portfolio, Error> => {
  return useQuery({
    queryKey: ['portfolio', userId],
    queryFn: async (): Promise<Portfolio> => {
      if (!userId) {
        return { balance: 0, shares: {} };
      }
      const pRef = doc(db, 'portfolios', userId);
      const snap = await getDoc(pRef);
      // Ensure initial users definitively get a pristine baseline account securely stored on first boot
      if (!snap.exists()) {
        const initialPortfolio: Portfolio = { balance: 10000, shares: {} };
        await setDoc(pRef, initialPortfolio);
        return initialPortfolio;
      }
      return snap.data() as Portfolio;
    },
    enabled: !!userId, // Safely ignore fetches if user is not authenticated
  });
};
