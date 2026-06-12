import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { registerOnConnect, subscribeStomp } from '@/lib/stompClient';

export function useOnlineCount() {
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  useEffect(() => {
    const loadOnlineCount = () => {
      apiFetch('/api/online-count')
        .then(res => res.ok ? res.json() : null)
        .then(payload => {
          if (payload && typeof payload.count === 'number') setOnlineCount(payload.count);
        })
        .catch(err => console.error('Failed to load online count', err));
    };

    loadOnlineCount();

    const subscription = subscribeStomp('/topic/online-count', message => {
      try {
        const payload = JSON.parse(message.body);
        if (typeof payload.count === 'number') setOnlineCount(payload.count);
      } catch (e) {
        console.error('Failed to parse online count message', e);
      }
    });
    const unregisterConnect = registerOnConnect(loadOnlineCount);

    return () => {
      subscription.unsubscribe();
      unregisterConnect();
    };
  }, []);

  return onlineCount;
}
