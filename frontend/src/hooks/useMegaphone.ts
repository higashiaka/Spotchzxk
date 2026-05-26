// 라이브 확성기 게시물 조회와 구매 요청을 묶은 훅입니다.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export interface MegaphonePost {
  id: string;
  userId: string;
  channelId: string;
  streamerName: string;
  message: string | null;
  liveUrl: string;
  createdAt: string;
}

export const useMegaphonePosts = () =>
  useQuery<MegaphonePost[]>({
    queryKey: ['megaphone-posts'],
    queryFn: async () => {
      const res = await apiFetch('/api/shop/megaphone/posts');
      if (!res.ok) throw new Error('확성기 목록 조회 실패');
      return res.json();
    },
    refetchInterval: 30_000,
  });

export const useMegaphoneUsesToday = (uid: string | undefined) =>
  useQuery<number>({
    queryKey: ['megaphone-uses-today', uid],
    queryFn: async () => {
      const res = await apiFetch('/api/shop/megaphone/my-uses-today');
      if (!res.ok) return 0;
      const data = await res.json();
      return data.count as number;
    },
    enabled: !!uid,
  });

export const useMegaphoneSubmit = (uid: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelId, message }: { channelId: string; message: string }) => {
      const res = await apiFetch('/api/shop/megaphone', {
        method: 'POST',
        body: JSON.stringify({ channelId, message }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '확성기 사용에 실패했습니다.');
      }
      return res.json() as Promise<MegaphonePost>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['megaphone-posts'] });
      queryClient.invalidateQueries({ queryKey: ['megaphone-uses-today', uid] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', uid] });
    },
    onError: (err: Error) => {
      alert(err.message);
    },
  });
};
