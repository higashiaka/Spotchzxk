import { getAuth } from 'firebase/auth';

const isBrowser = typeof window !== 'undefined';

const normalizeBaseUrl = (raw: string | undefined): string => {
  if (!raw || raw.includes('localhost')) return '';
  if (!isBrowser) return raw;

  try {
    const url = new URL(raw);
    if (url.host === window.location.host) return '';
    if (window.location.protocol === 'https:' && url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
};

/** Base URL for REST API. Empty in local dev so Vite can proxy /api to the configured backend. */
export const API_BASE = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

/** STOMP WebSocket endpoint URL */
const defaultWsUrl = `${window.location.protocol}//${window.location.host}/ws`;
const configuredWsUrl = import.meta.env.VITE_WS_URL;
export const WS_URL = normalizeBaseUrl(configuredWsUrl) || defaultWsUrl;

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
