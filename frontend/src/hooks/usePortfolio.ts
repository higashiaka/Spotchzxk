import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export interface Portfolio {
  balance: number;
  shares: Record<string, number>;
  avgPrices: Record<string, number>;
  remainingResets: number;
}

export const usePortfolio = (userId: string | undefined): UseQueryResult<Portfolio, Error> => {
  return useQuery({
    queryKey: ['portfolio', userId],
    queryFn: async (): Promise<Portfolio> => {
      if (!userId) return { balance: 0, shares: {} };
      const res = await apiFetch('/api/portfolio');
      if (!res.ok) throw new Error('포트폴리오 조회 실패');
      return res.json();
    },
    enabled: !!userId,
  });
};
