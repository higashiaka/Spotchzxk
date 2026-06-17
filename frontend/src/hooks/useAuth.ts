import { useState, useEffect, useCallback } from 'react';
import {
  signInWithPopup, signOut, onAuthStateChanged,
  User, signInAnonymously,
  linkWithPopup, signInWithCredential,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { apiFetch } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';

const HAS_LINKED_ACCOUNT_KEY = 'has_linked_account';
const GUEST_SOFT_LOGGED_OUT_KEY = 'guest_soft_logged_out';

export type GuestLimitNotice = { retryAtMs: number };
export type SuspensionNotice = {
  reason: string;
  suspendedUntil: string;
};

export const guestLimitLabel = (retryAtMs: number, nowMs: number) => {
  const remainingSeconds = Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}분 ${seconds.toString().padStart(2, '0')}초`;
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [guestLimitNotice, setGuestLimitNotice] = useState<GuestLimitNotice | null>(null);
  const [guestLimitNow, setGuestLimitNow] = useState(Date.now());
  const [suspensionNotice, setSuspensionNotice] = useState<SuspensionNotice | null>(null);
  const queryClient = useQueryClient();

  const refreshSuspensionStatus = useCallback(async () => {
    if (!auth.currentUser || localStorage.getItem(GUEST_SOFT_LOGGED_OUT_KEY) === 'true') {
      setSuspensionNotice(null);
      return;
    }
    try {
      const res = await apiFetch('/api/auth/me');
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      if (body.suspended) {
        setSuspensionNotice({
          reason: String(body.suspensionReason ?? 'Policy violation'),
          suspendedUntil: String(body.suspendedUntil ?? ''),
        });
      } else {
        setSuspensionNotice(null);
      }
    } catch (err) {
      console.error('Failed to refresh suspension status', err);
    }
  }, []);

  useEffect(() => {
    if (!guestLimitNotice) return;
    setGuestLimitNow(Date.now());
    const timer = window.setInterval(() => setGuestLimitNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [guestLimitNotice]);

  useEffect(() => {
    if (guestLimitNotice && guestLimitNow >= guestLimitNotice.retryAtMs) {
      setGuestLimitNotice(null);
    }
  }, [guestLimitNotice, guestLimitNow]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      const isSoftLoggedOutGuest =
        !!u && u.isAnonymous && localStorage.getItem(GUEST_SOFT_LOGGED_OUT_KEY) === 'true';
      setUser(isSoftLoggedOutGuest ? null : u);
      if (u && !isSoftLoggedOutGuest) {
        await refreshSuspensionStatus();
      } else {
        setSuspensionNotice(null);
      }
      setAuthChecking(false);

      const pendingGuestUid = localStorage.getItem('pendingGuestMerge');
      if (pendingGuestUid && u && u.providerData.some(p => p.providerId === 'google.com')) {
        localStorage.removeItem('pendingGuestMerge');
        try {
          const res = await apiFetch('/api/auth/link-google', {
            method: 'POST',
            body: JSON.stringify({ guestUid: pendingGuestUid }),
          });
          if (res.ok || res.status === 404 || res.status === 409) {
            localStorage.setItem(HAS_LINKED_ACCOUNT_KEY, 'true');
            if (res.status === 409) {
              alert('이미 사용 중인 Google 계정이라 게스트 자산을 자동 병합하지 않았습니다.');
            }
          } else {
            localStorage.setItem('pendingGuestMerge', pendingGuestUid);
          }
        } catch {
          localStorage.setItem('pendingGuestMerge', pendingGuestUid);
        }
      }
    });
    return () => unsub();
  }, [refreshSuspensionStatus]);

  useEffect(() => {
    if (!user) return;
    refreshSuspensionStatus();
    const timer = window.setInterval(refreshSuspensionStatus, 60_000);
    return () => window.clearInterval(timer);
  }, [user, refreshSuspensionStatus]);

  const handleGoogleLogin = useCallback(async () => {
    try {
      if (auth.currentUser?.isAnonymous && localStorage.getItem(GUEST_SOFT_LOGGED_OUT_KEY) === 'true') {
        await signOut(auth);
      }
      localStorage.removeItem(GUEST_SOFT_LOGGED_OUT_KEY);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
      alert('Google 로그인에 실패했습니다.');
    }
  }, []);

  const handleGuestLogin = useCallback(async () => {
    try {
      let precheckToken: string | undefined;
      let fingerprintHash: string | undefined;

      if (localStorage.getItem(HAS_LINKED_ACCOUNT_KEY) === 'true') {
        alert('이미 Google 연동을 완료한 계정이 있습니다. Google 로그인으로 이용해 주세요.');
        await handleGoogleLogin();
        return;
      }
      localStorage.removeItem(GUEST_SOFT_LOGGED_OUT_KEY);

      if (!auth.currentUser) {
        const FP = await import('@fingerprintjs/fingerprintjs');
        const fp = await FP.load();
        const fpResult = await fp.get();
        fingerprintHash = fpResult.visitorId;
        const precheck = await apiFetch('/api/guest/precheck', {
          method: 'POST',
          body: JSON.stringify({ fingerprintHash }),
        });
        if (precheck.status === 429 || precheck.status === 403) {
          const body = await precheck.json().catch(() => ({}));
          const retryAfterSeconds = Number(body.retryAfterSeconds ?? 300);
          setGuestLimitNotice({ retryAtMs: Date.now() + retryAfterSeconds * 1000 });
          return;
        }
        if (!precheck.ok) throw new Error('Guest precheck failed');
        const precheckBody = await precheck.json().catch(() => ({}));
        precheckToken = typeof precheckBody.precheckToken === 'string'
          ? precheckBody.precheckToken
          : undefined;
        await signInAnonymously(auth);
      } else {
        setUser(auth.currentUser);
      }

      const res = await apiFetch('/api/guest/register', {
        method: 'POST',
        body: JSON.stringify({ precheckToken, fingerprintHash }),
      });
      if (res.status === 429 || res.status === 403) {
        const body = await res.json().catch(() => ({}));
        const retryAfterSeconds = Number(body.retryAfterSeconds ?? 300);
        await signOut(auth);
        setGuestLimitNotice({ retryAtMs: Date.now() + retryAfterSeconds * 1000 });
        return;
      }
      if (!res.ok) throw new Error('Guest registration failed');
    } catch (err) {
      console.error(err);
      alert('게스트 로그인 오류: Firebase Console에서 익명 로그인을 활성화하세요.');
    }
  }, [handleGoogleLogin]);

  const handleGuestLimitGoogleLogin = useCallback(async () => {
    setGuestLimitNotice(null);
    await handleGoogleLogin();
  }, [handleGoogleLogin]);

  const handleLogout = useCallback(async () => {
    if (auth.currentUser?.isAnonymous) {
      localStorage.setItem(GUEST_SOFT_LOGGED_OUT_KEY, 'true');
      setUser(null);
      queryClient.removeQueries({ queryKey: ['portfolio'] });
      queryClient.removeQueries({ queryKey: ['history'] });
      return;
    }
      localStorage.removeItem(GUEST_SOFT_LOGGED_OUT_KEY);
      setSuspensionNotice(null);
      await signOut(auth);
  }, [queryClient]);

  const handleLinkGoogle = useCallback(async () => {
    if (!user) return;
    try {
      await linkWithPopup(user, googleProvider);
      await user.getIdToken(true);
      localStorage.setItem(HAS_LINKED_ACCOUNT_KEY, 'true');
      try {
        const res = await apiFetch('/api/auth/upgrade-guest', { method: 'POST' });
        if (!res.ok) console.error('Failed to upgrade guest after Google linking', res.status);
      } catch (upgradeErr) {
        console.error('Failed to upgrade guest after Google linking', upgradeErr);
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') return;

      if (err.code === 'auth/credential-already-in-use') {
        const guestUid = user.uid;
        localStorage.setItem(HAS_LINKED_ACCOUNT_KEY, 'true');
        localStorage.setItem('pendingGuestMerge', guestUid);
        try {
          await signInWithCredential(auth, err.credential);
        } catch (signInErr) {
          localStorage.removeItem('pendingGuestMerge');
          console.error(signInErr);
          alert('계정 연동 중 오류가 발생했습니다. 다시 시도해 주세요.');
        }
        return;
      }

      console.error(err);
      alert('Google 연동에 실패했습니다: ' + (err.message ?? ''));
    }
  }, [user]);

  return {
    user,
    authChecking,
    guestLimitNotice,
    guestLimitNow,
    suspensionNotice,
    handleGoogleLogin,
    handleGuestLogin,
    handleGuestLimitGoogleLogin,
    handleLogout,
    handleLinkGoogle,
  };
}
