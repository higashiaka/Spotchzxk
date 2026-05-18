import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export const useResetPortfolio = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/portfolio/reset', { method: 'POST' });
      if (!res.ok) throw new Error('초기화 실패');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['portfolio', userId], data);
    },
  });
};
