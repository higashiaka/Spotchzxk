import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { subscribeStomp } from '../lib/stompClient';

/** Megaphone post data structure */
export interface MegaphonePost {
  /** Unique post ID */
  id: string;
  /** UID of the user who posted */
  userId: string;
  /** Channel ID of the announced streamer */
  channelId: string;
  /** Streamer name */
  streamerName: string;
  /** Optional message, null if none */
  message: string | null;
  /** Chzzk live URL */
  liveUrl: string;
  /** Live session start time captured when posted */
  liveSessionStartedAt: string | null;
  /** Post creation time in ISO 8601 */
  createdAt: string;
}

const MEGAPHONE_POSTS_QUERY_KEY = ['megaphone-posts'] as const;
const MAX_VISIBLE_MEGAPHONE_POSTS = 20;

function mergeMegaphonePost(posts: MegaphonePost[] | undefined, post: MegaphonePost) {
  return [post, ...(posts ?? []).filter(item => item.id !== post.id)].slice(0, MAX_VISIBLE_MEGAPHONE_POSTS);
}

/** Home megaphone feed.
 *  Combines the public REST list with /topic/megaphone real-time events.
 *  Backend query conditions are the single source of truth for visibility. */
export const useVisibleMegaphonePosts = () => {
  const queryClient = useQueryClient();
  const query = useQuery<MegaphonePost[]>({
    queryKey: MEGAPHONE_POSTS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiFetch('/api/shop/megaphone/posts');
      if (!res.ok) throw new Error('확성기 목록 조회 실패');
      return res.json();
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const sub = subscribeStomp('/topic/megaphone', msg => {
      try {
        const post = JSON.parse(msg.body) as MegaphonePost;
        queryClient.setQueryData<MegaphonePost[]>(MEGAPHONE_POSTS_QUERY_KEY, posts => mergeMegaphonePost(posts, post));
      } catch {
        /* ignore parse errors */
      }
    });
    return () => sub.unsubscribe();
  }, [queryClient]);

  return useMemo(() => query.data ?? [], [query.data]);
};

/** Fetches how many times the user has used the megaphone today */
export const useMegaphoneUsesToday = (uid: string | undefined) =>
  useQuery<number>({
    queryKey: ['megaphone-uses-today', uid],
    queryFn: async () => {
      const res = await apiFetch('/api/shop/megaphone/my-uses-today');
      if (!res.ok) throw new Error('확성기 사용 횟수 조회 실패');
      const data = await res.json();
      return data.count as number;
    },
    enabled: !!uid,
  });

/** Megaphone submit mutation hook.
 *  On success, immediately inserts the returned post and refreshes usage count and portfolio caches. */
export const useMegaphoneSubmit = (uid: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    /** Sends a megaphone use request to the server */
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
    onSuccess: post => {
      queryClient.setQueryData<MegaphonePost[]>(MEGAPHONE_POSTS_QUERY_KEY, posts => mergeMegaphonePost(posts, post));
      queryClient.invalidateQueries({ queryKey: ['megaphone-uses-today', uid] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', uid] });
    },
    onError: (err: Error) => {
      alert(err.message);
    },
  });
};
