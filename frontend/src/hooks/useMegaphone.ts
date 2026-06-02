import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { subscribeStomp } from '../lib/stompClient';
import type { Stock } from './useStocks';

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

const MEGAPHONE_POSTS_QUERY_KEY = ['megaphone-posts'] as const;
const MAX_VISIBLE_MEGAPHONE_POSTS = 20;

function mergeMegaphonePost(posts: MegaphonePost[] | undefined, post: MegaphonePost) {
  return [post, ...(posts ?? []).filter(item => item.id !== post.id)].slice(0, MAX_VISIBLE_MEGAPHONE_POSTS);
}

function isVisibleInCurrentLiveSession(post: MegaphonePost, streamers: Stock[]) {
  const streamer = streamers.find(item => item.id === post.channelId);
  if (!streamer?.isLive) {
    return false;
  }
  if (!streamer.liveStartedAt) {
    return true;
  }
  return new Date(post.createdAt).getTime() >= new Date(streamer.liveStartedAt).getTime();
}

/** 홈 확성기 목록.
 *  공개 REST 목록과 /topic/megaphone 실시간 수신을 하나로 합치고,
 *  현재 라이브 세션에 유효한 확성기만 반환한다.
 *
 *  Home megaphone feed.
 *  Combines the public REST list with /topic/megaphone real-time events
 *  and returns only posts valid for the current live session. */
export const useVisibleMegaphonePosts = (streamers: Stock[]) => {
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

  return useMemo(
    () => (query.data ?? []).filter(post => isVisibleInCurrentLiveSession(post, streamers)),
    [query.data, streamers],
  );
};

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
    onSuccess: post => {
      queryClient.setQueryData<MegaphonePost[]>(MEGAPHONE_POSTS_QUERY_KEY, posts => mergeMegaphonePost(posts, post));
      queryClient.invalidateQueries({ queryKey: MEGAPHONE_POSTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['megaphone-uses-today', uid] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', uid] });
    },
    onError: (err: Error) => {
      alert(err.message);
    },
  });
};
