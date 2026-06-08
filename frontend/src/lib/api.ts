import { getAuth } from 'firebase/auth';

/** Base URL for the backend REST API; falls back to localhost if env var is unset */
export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

/** STOMP WebSocket endpoint URL */
export const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:8080/ws';

/** Fetch wrapper that automatically injects the Firebase ID token into the Authorization header */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuth().currentUser?.getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
