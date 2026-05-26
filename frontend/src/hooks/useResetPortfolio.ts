import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

/** 포트폴리오 초기화 mutation 훅.
 *  성공 시 서버 응답으로 포트폴리오 캐시를 즉시 갱신
 *
 *  Mutation hook for resetting the portfolio.
 *  On success, immediately updates the portfolio cache with the server response */
export const useResetPortfolio = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    /** 서버에 초기화 요청을 전송하고 새 포트폴리오를 반환
     *  Sends a reset request to the server and returns the refreshed portfolio */
    mutationFn: async () => {
      const res = await apiFetch('/api/portfolio/reset', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? '초기화 실패');
      }
      return res.json();
    },

    /** 초기화 성공 시 포트폴리오 캐시를 서버 응답값으로 교체
     *  Replaces the portfolio cache with the fresh server response on success */
    onSuccess: (data) => {
      queryClient.setQueryData(['portfolio', userId], data);
    },

    /** 초기화 실패 시 에러 메시지를 알림으로 표시
     *  Alerts the user with the error message on failure */
    onError: (err: Error) => {
      alert(err.message);
    },
  });
};
