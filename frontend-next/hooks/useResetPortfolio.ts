import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

/** Mutation hook for resetting the portfolio.
 *  On success, immediately updates the portfolio cache with the server response */
export const useResetPortfolio = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    /** Sends a reset request to the server and returns the refreshed portfolio */
    mutationFn: async () => {
      const res = await apiFetch('/api/portfolio/reset', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? '초기화 실패');
      }
      return res.json();
    },

    /** Replaces the portfolio cache with the fresh server response on success */
    onSuccess: (data) => {
      queryClient.setQueryData(['portfolio', userId], data);
    },

    /** Alerts the user with the error message on failure */
    onError: (err: Error) => {
      alert(err.message);
    },
  });
};
