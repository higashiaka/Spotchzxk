import { useEffect } from 'react';

export function NaverCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (window.opener && code) {
      window.opener.postMessage(
        { type: 'NAVER_AUTH_CODE', code, state },
        window.location.origin,
      );
      window.close();
    }
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      네이버 로그인 처리 중...
    </div>
  );
}
