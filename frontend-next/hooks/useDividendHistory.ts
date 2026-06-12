import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { apiFetch } from '@/lib/api';
import { subscribeStomp } from '@/lib/stompClient';

export function useDividendHistory(user: User | null) {
  const [dividendHistory, setDividendHistory] = useState<any[]>([]);
  const [dividendHistoryLoaded, setDividendHistoryLoaded] = useState(false);

  const fetchDividendHistory = () => {
    apiFetch('/api/dividends/my')
      .then(res => res.ok ? res.json() : [])
      .then((data: any[]) => { setDividendHistory(data); setDividendHistoryLoaded(true); })
      .catch(() => setDividendHistoryLoaded(true));
  };

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    fetchDividendHistory();
  }, [user]);

  useEffect(() => {
    if (!user || user.isAnonymous) return;

    const subGlobal = subscribeStomp('/topic/dividends', () => {
      fetchDividendHistory();
    });

    const subPersonal = subscribeStomp(`/topic/user-dividends/${user.uid}`, message => {
      try {
        const entry = JSON.parse(message.body);
        setDividendHistory(prev => {
          if (prev.some(d => d.channelId === entry.channelId && d.createdAt === entry.createdAt)) {
            return prev;
          }
          return [entry, ...prev].slice(0, 50);
        });
      } catch {
        // covered by subGlobal re-fetch
      }
    });

    return () => {
      subGlobal.unsubscribe();
      subPersonal.unsubscribe();
    };
  }, [user]);

  return { dividendHistory, dividendHistoryLoaded };
}
