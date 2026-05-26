#!/bin/bash
set -e

FRONTEND=/opt/spotchzxk/frontend

# 1. api.ts 수정
cat > $FRONTEND/src/lib/api.ts << 'EOF'
import { getAuth } from 'firebase/auth';

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
export const WS_URL = import.meta.env.VITE_WS_URL ?? '';

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuth().currentUser?.getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
EOF

# 2. .env 수정
cat > $FRONTEND/.env << 'EOF'
VITE_FIREBASE_API_KEY="AIzaSyC6GhNSnzPy9_kaZMKyorMtFliEGNlMcZs"
VITE_FIREBASE_AUTH_DOMAIN="spotchzxk.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="spotchzxk"
VITE_FIREBASE_STORAGE_BUCKET="spotchzxk.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="600243858985"
VITE_FIREBASE_APP_ID="1:600243858985:web:74c6716d4eebe58fedb638"
VITE_FIREBASE_MEASUREMENT_ID="G-WWXWSSGXBG"
VITE_API_BASE_URL=
VITE_WS_URL=https://spotchzxk.xyz/ws
EOF

# 3. 빌드 (root 소유 dist가 남아있을 경우 권한 오류 방지)
sudo rm -rf $FRONTEND/dist
cd $FRONTEND && npm run build

echo "완료"
