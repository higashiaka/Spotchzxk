import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

/** 확성기 게시물 데이터 구조
 *  Megaphone post data structure */
export interface MegaphonePost {
  /** 게시물 고유 ID / Unique post ID */
  id: string;
  /** 게시한 사용자 UID / UID of the user who posted */
  userId: string;
  /** 공지 대상 스트리머 채널 ID / Channel ID of the announced streamer */
  channelId: string;
  /** 스트리머 이름 / Streamer name */
  streamerName: string;
  /** 추가 메시지 (없으면 null) / Optional message, null if none */
  message: string | null;
  /** 치지직 라이브 링크 / Chzzk live URL */
  liveUrl: string;
  /** 게시 시각 (ISO 8601) / Post creation time in ISO 8601 */
  createdAt: string;
}

/** 최근 확성기 게시 목록을 30초 간격으로 폴링
 *  Polls the recent megaphone post list every 30 seconds */
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

/** 오늘 해당 사용자의 확성기 사용 횟수를 조회
 *  Fetches how many times the user has used the megaphone today */
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

/** 확성기 게시 mutation 훅.
 *  성공 시 게시 목록·사용 횟수·포트폴리오 캐시를 모두 무효화
 *
 *  Megaphone submit mutation hook.
 *  On success, invalidates post list, usage count, and portfolio caches */
export const useMegaphoneSubmit = (uid: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    /** 확성기 사용 요청을 서버에 전송 / Sends a megaphone use request to the server */
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
