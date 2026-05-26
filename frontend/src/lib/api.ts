import { getAuth } from 'firebase/auth';

/** 백엔드 REST API 기본 URL (환경변수 우선, 없으면 localhost 기본값)
 *  Base URL for the backend REST API; falls back to localhost if env var is unset */
export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

/** STOMP WebSocket 엔드포인트 URL
 *  STOMP WebSocket endpoint URL */
export const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:8080/ws';

/** Firebase 인증 토큰을 Authorization 헤더에 자동으로 주입하는 fetch 래퍼
 *  Fetch wrapper that automatically injects the Firebase ID token into the Authorization header */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuth().currentUser?.getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
