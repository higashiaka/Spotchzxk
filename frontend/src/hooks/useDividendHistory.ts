import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { apiFetch } from '../lib/api';
import { subscribeStomp } from '../lib/stompClient';
import { useQueryClient } from '@tanstack/react-query';

export function useDividendHistory(user: User | null) {
  const [dividendHistory, setDividendHistory] = useState<any[]>([]);
  const [dividendHistoryLoaded, setDividendHistoryLoaded] = useState(false);
  const queryClient = useQueryClient();

  const fetchDividendHistory = useCallback(() => {
    apiFetch('/api/dividends/my')
      .then(res => res.ok ? res.json() : [])
      .then((data: any[]) => { setDividendHistory(data); setDividendHistoryLoaded(true); })
      .catch(() => setDividendHistoryLoaded(true));
  }, []);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    fetchDividendHistory();
  }, [user, fetchDividendHistory]);

  useEffect(() => {
    if (!user || user.isAnonymous) return;

    const subPersonal = subscribeStomp(`/topic/user-dividends/${user.uid}`, message => {
      try {
        const entry = JSON.parse(message.body);
        setDividendHistory(prev => {
          if (prev.some(d => d.channelId === entry.channelId && d.createdAt === entry.createdAt)) {
            return prev;
          }
          return [entry, ...prev].slice(0, 50);
        });
        queryClient.invalidateQueries({ queryKey: ['portfolio', user.uid] });
      } catch {
        fetchDividendHistory();
      }
    });

    return () => {
      subPersonal.unsubscribe();
    };
  }, [user, fetchDividendHistory, queryClient]);

  return { dividendHistory, dividendHistoryLoaded };
}
