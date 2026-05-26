import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

/** 서버에서 내려오는 포트폴리오 데이터 구조
 *  Portfolio data structure returned by the backend */
export interface Portfolio {
  /** 보유 현금 잔고 (원) / Cash balance in KRW */
  balance: number;
  /** 종목별 보유 수량 (channelId → 수량) / Shares held per stock (channelId → quantity) */
  shares: Record<string, number>;
  /** 종목별 평균 매입 단가 (channelId → 평단가) / Average purchase price per stock */
  avgPrices: Record<string, number>;
  /** 누적 수령 배당금 합계 / Total dividends received to date */
  dividendTotal: number;
  /** 오늘 남은 포트폴리오 초기화 횟수 / Remaining portfolio reset count for today */
  remainingResets: number;
}

/** 로그인 사용자의 포트폴리오를 조회하는 React Query 훅.
 *  userId가 없으면 쿼리를 실행하지 않음
 *
 *  React Query hook that fetches the logged-in user's portfolio.
 *  Query is disabled when userId is falsy */
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
    /** 12초 간격 폴링: 배당·어드민 조정 등 STOMP로 잡히지 않는 변경의 안전망
     *  Poll every 12s as a safety net for changes not covered by STOMP (dividends, admin adjustments) */
    refetchInterval: 12000,
  });
};
