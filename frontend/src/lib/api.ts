import { getAuth } from 'firebase/auth';

/** Base URL for REST API. Empty in local dev so Vite can proxy /api to the configured backend. */
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/** STOMP WebSocket endpoint URL */
const defaultWsUrl = `${window.location.protocol}//${window.location.host}/ws`;
export const WS_URL = import.meta.env.VITE_WS_URL || defaultWsUrl;

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
