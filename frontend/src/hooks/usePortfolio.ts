import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

/** Portfolio data structure returned by the backend */
export interface Portfolio {
  /** Cash balance in KRW */
  balance: number;
  /** Shares held per stock (channelId → quantity) */
  shares: Record<string, number>;
  /** Average purchase price per stock */
  avgPrices: Record<string, number>;
  /** Total dividends received to date */
  dividendTotal: number;
  displayName?: string | null;
  realizedProfit?: number;
  rankingNicknamePublic?: boolean;
  nicknameChangeTickets?: number;
  stockAddTickets?: number;
  /** Remaining portfolio reset count for today */
  remainingResets: number;
}

/** React Query hook that fetches the logged-in user's portfolio.
 *  Query is disabled when userId is falsy */
export const usePortfolio = (userId: string | undefined): UseQueryResult<Portfolio, Error> => {
  return useQuery({
    queryKey: ['portfolio', userId],
    queryFn: async (): Promise<Portfolio> => {
      if (!userId) return { balance: 0, shares: {}, avgPrices: {}, dividendTotal: 0, remainingResets: 0 };
      const res = await apiFetch('/api/portfolio');
      if (!res.ok) throw new Error('포트폴리오 조회 실패');
      return res.json();
    },
    enabled: !!userId,
    /** Poll every 12s as a safety net for changes not covered by STOMP (dividends, admin adjustments) */
    refetchInterval: 12000,
  });
};
