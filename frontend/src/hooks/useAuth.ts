import { useState, useEffect, useCallback } from 'react';
import {
  signInWithPopup, signOut, onAuthStateChanged,
  User, signInAnonymously,
  linkWithPopup, signInWithCredential, signInWithCustomToken,
  AuthProvider,
} from 'firebase/auth';
import { auth, googleProvider, naverProvider } from '../firebase';
import { apiFetch } from '../lib/api';
import { subscribeStomp } from '../lib/stompClient';
import { useQueryClient } from '@tanstack/react-query';

const HAS_LINKED_ACCOUNT_KEY = 'has_linked_account';
const GUEST_SOFT_LOGGED_OUT_KEY = 'guest_soft_logged_out';
const PENDING_GUEST_MERGE_KEY = 'pendingGuestMerge';
const SOCIAL_PROVIDER_IDS = new Set(['google.com', 'oidc.naver']);

export type GuestLimitNotice = { retryAtMs: number };
export type SuspensionNotice = {
  reason: string;
  suspendedUntil: string;
};

type FirebaseAuthError = Error & {
  code?: string;
  credential?: Parameters<typeof signInWithCredential>[1];
};

const hasSocialProvider = (u: User | null | undefined) =>
  !!u && (u.providerData.some(p => SOCIAL_PROVIDER_IDS.has(p.providerId)) || u.uid.startsWith('naver:'));

export const guestLimitLabel = (retryAtMs: number, nowMs: number) => {
  const remainingSeconds = Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [guestLimitNotice, setGuestLimitNotice] = useState<GuestLimitNotice | null>(null);
  const [guestLimitNow, setGuestLimitNow] = useState(Date.now());
  const [suspensionNotice, setSuspensionNotice] = useState<SuspensionNotice | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [naverLinked, setNaverLinked] = useState(false);
  const queryClient = useQueryClient();
  const userUid = user?.uid;

  const refreshSuspensionStatus = useCallback(async () => {
    if (!auth.currentUser || localStorage.getItem(GUEST_SOFT_LOGGED_OUT_KEY) === 'true') {
      setSuspensionNotice(null);
      return;
    }
    try {
      const res = await apiFetch('/api/auth/me');
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      const authorities = Array.isArray(body.authorities) ? body.authorities : [];
      setIsAdmin(authorities.includes('ROLE_ADMIN'));
      setNaverLinked(body.naverLinked === true);
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
      setIsAdmin(false);
    }
  }, []);

  const upgradeGuest = useCallback(async (providerLabel: string) => {
    try {
      const res = await apiFetch('/api/auth/upgrade-guest', { method: 'POST' });
      if (!res.ok) console.error(`Failed to upgrade guest after ${providerLabel} linking`, res.status);
    } catch (upgradeErr) {
      console.error(`Failed to upgrade guest after ${providerLabel} linking`, upgradeErr);
    }
  }, []);

  const handleSocialCredentialInUse = useCallback(async (err: FirebaseAuthError, guestUid: string, providerLabel: string) => {
    if (!err.credential) {
      alert(`${providerLabel} account is already linked to another account. Please log in with that account.`);
      return;
    }
    localStorage.setItem(HAS_LINKED_ACCOUNT_KEY, 'true');
    localStorage.setItem(PENDING_GUEST_MERGE_KEY, guestUid);
    try {
      await signInWithCredential(auth, err.credential);
    } catch (signInErr) {
      localStorage.removeItem(PENDING_GUEST_MERGE_KEY);
      console.error(signInErr);
      alert(`${providerLabel} account linking failed. Please try again.`);
    }
  }, []);

  const signInWithSocialProvider = useCallback(async (provider: AuthProvider, providerLabel: string) => {
    try {
      if (auth.currentUser?.isAnonymous && localStorage.getItem(GUEST_SOFT_LOGGED_OUT_KEY) === 'true') {
        await signOut(auth);
      }
      localStorage.removeItem(GUEST_SOFT_LOGGED_OUT_KEY);
      const credential = await signInWithPopup(auth, provider);
      if (hasSocialProvider(credential.user)) {
        localStorage.setItem(HAS_LINKED_ACCOUNT_KEY, 'true');
      }
    } catch (err: unknown) {
      const authErr = err as FirebaseAuthError;
      if (authErr.code === 'auth/popup-closed-by-user') return;
      console.error(authErr);
      alert(`${providerLabel} login failed. Please try again.`);
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
        setIsAdmin(false);
        setNaverLinked(false);
      }
      setAuthChecking(false);

      const pendingGuestUid = localStorage.getItem(PENDING_GUEST_MERGE_KEY);
      const isSocialUser = hasSocialProvider(u);
      if (isSocialUser) {
        localStorage.setItem(HAS_LINKED_ACCOUNT_KEY, 'true');
      }
      if (pendingGuestUid && u && isSocialUser) {
        localStorage.removeItem(PENDING_GUEST_MERGE_KEY);
        try {
          const res = await apiFetch('/api/auth/link-social', {
            method: 'POST',
            body: JSON.stringify({ guestUid: pendingGuestUid }),
          });
          if (res.ok || res.status === 404 || res.status === 409) {
            localStorage.setItem(HAS_LINKED_ACCOUNT_KEY, 'true');
            if (res.status === 409) {
              alert('This social account already exists, so guest assets were not merged automatically.');
            }
          } else {
            localStorage.setItem(PENDING_GUEST_MERGE_KEY, pendingGuestUid);
          }
        } catch {
          localStorage.setItem(PENDING_GUEST_MERGE_KEY, pendingGuestUid);
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

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    apiFetch('/api/profile/profile-image', {
      method: 'POST',
      body: JSON.stringify({ profileImageUrl: user.photoURL ?? '' }),
    }).catch(err => console.error('Failed to sync profile image', err));
  }, [user?.uid, user?.photoURL, user?.isAnonymous]);

  useEffect(() => {
    if (!userUid) return;
    const subscription = subscribeStomp(`/topic/user-suspension/${userUid}`, (message) => {
      try {
        const body = JSON.parse(message.body);
        if (body.suspended) {
          setSuspensionNotice({
            reason: String(body.reason ?? 'Policy violation'),
            suspendedUntil: String(body.suspendedUntil ?? ''),
          });
        } else {
          setSuspensionNotice(null);
        }
      } catch (e) {
        console.error('Failed to parse suspension message', e);
      }
    });
    return () => subscription.unsubscribe();
  }, [userUid]);

  const handleGoogleLogin = useCallback(
    () => signInWithSocialProvider(googleProvider, 'Google'),
    [signInWithSocialProvider]
  );

  const handleNaverLogin = useCallback(async () => {
    const state = Math.random().toString(36).slice(2);
    const clientId = import.meta.env.VITE_NAVER_CLIENT_ID as string;
    const redirectUri = encodeURIComponent(`${window.location.origin}/naver-callback`);
    const naverAuthUrl =
      `https://nid.naver.com/oauth2.0/authorize?response_type=code` +
      `&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`;

    const popup = window.open(naverAuthUrl, 'naverLogin', 'width=500,height=600,left=200,top=100');

    return new Promise<void>((resolve) => {
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== 'NAVER_AUTH_CODE') return;
        window.removeEventListener('message', handleMessage);
        clearInterval(closedCheck);
        try {
          const res = await apiFetch('/api/auth/naver/token', {
            method: 'POST',
            body: JSON.stringify({ code: event.data.code, state: event.data.state }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            alert('?ㅼ씠踰?濡쒓렇???ㅽ뙣: ' + (body.message ?? '?????녿뒗 ?ㅻ쪟'));
            resolve();
            return;
          }
          const { customToken } = await res.json();
          await signInWithCustomToken(auth, customToken);
          localStorage.setItem(HAS_LINKED_ACCOUNT_KEY, 'true');
        } catch {
          alert('?ㅼ씠踰?濡쒓렇??以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
        }
        resolve();
      };

      window.addEventListener('message', handleMessage);

      const closedCheck = setInterval(() => {
        if (popup?.closed) {
          clearInterval(closedCheck);
          window.removeEventListener('message', handleMessage);
          resolve();
        }
      }, 500);
    });
  }, []);

  const handleGuestLogin = useCallback(async () => {
    try {
      let precheckToken: string | undefined;
      let fingerprintHash: string | undefined;
      let createdAnonymousThisAttempt = false;

      if (localStorage.getItem(HAS_LINKED_ACCOUNT_KEY) === 'true') {
        alert('This browser already used a linked account. Please continue with social login.');
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
        createdAnonymousThisAttempt = true;
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
        if (createdAnonymousThisAttempt) {
          await signOut(auth);
        }
        setGuestLimitNotice({ retryAtMs: Date.now() + retryAfterSeconds * 1000 });
        return;
      }
      if (!res.ok) throw new Error('Guest registration failed');
    } catch (err) {
      console.error(err);
      alert('Guest login failed. Please check Firebase anonymous login settings.');
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
    const wasAnonymous = user.isAnonymous;
    try {
      await linkWithPopup(user, googleProvider);
      await user.getIdToken(true);
      localStorage.setItem(HAS_LINKED_ACCOUNT_KEY, 'true');
      if (wasAnonymous) await upgradeGuest('Google');
    } catch (err: unknown) {
      const authErr = err as FirebaseAuthError;
      if (authErr.code === 'auth/popup-closed-by-user') return;
      if (authErr.code === 'auth/credential-already-in-use') {
        await handleSocialCredentialInUse(authErr, user.uid, 'Google');
        return;
      }
      console.error(authErr);
      alert('Google account linking failed: ' + (authErr.message ?? ''));
    }
  }, [handleSocialCredentialInUse, upgradeGuest, user]);

  const handleLinkNaver = useCallback(async () => {
    if (!user) return;
    const wasAnonymous = user.isAnonymous;

    const state = Math.random().toString(36).slice(2);
    const clientId = import.meta.env.VITE_NAVER_CLIENT_ID as string;
    const redirectUri = encodeURIComponent(`${window.location.origin}/naver-callback`);
    const naverAuthUrl =
      `https://nid.naver.com/oauth2.0/authorize?response_type=code` +
      `&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`;

    const popup = window.open(naverAuthUrl, 'naverLink', 'width=500,height=600,left=200,top=100');

    return new Promise<void>((resolve) => {
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== 'NAVER_AUTH_CODE') return;
        window.removeEventListener('message', handleMessage);
        clearInterval(closedCheck);
        try {
          const res = await apiFetch('/api/auth/naver/link', {
            method: 'POST',
            body: JSON.stringify({ code: event.data.code, state: event.data.state }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            alert('?ㅼ씠踰??곕룞 ?ㅽ뙣: ' + (body.message ?? '?????녿뒗 ?ㅻ쪟'));
            resolve();
            return;
          }
          localStorage.setItem(HAS_LINKED_ACCOUNT_KEY, 'true');
          setNaverLinked(true);
          if (wasAnonymous) await upgradeGuest('Naver');
          alert('네이버 계정이 연동되었습니다. 추가 자본 1,000만원이 지급되었습니다.');
        } catch {
          alert('?ㅼ씠踰??곕룞 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
        }
        resolve();
      };

      window.addEventListener('message', handleMessage);

      const closedCheck = setInterval(() => {
        if (popup?.closed) {
          clearInterval(closedCheck);
          window.removeEventListener('message', handleMessage);
          resolve();
        }
      }, 500);
    });
  }, [upgradeGuest, user]);

  return {
    user,
    authChecking,
    guestLimitNotice,
    guestLimitNow,
    suspensionNotice,
    isAdmin,
    naverLinked,
    handleGoogleLogin,
    handleNaverLogin,
    handleGuestLogin,
    handleGuestLimitGoogleLogin,
    handleLogout,
    handleLinkGoogle,
    handleLinkNaver,
  };
}
