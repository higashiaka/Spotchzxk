// 배당금 수령 내역과 누적 배당 정보를 조회합니다.
import { useState, useEffect } from 'react';
import { API_BASE } from '../lib/api';
import { subscribeStomp } from '../lib/stompClient';

export interface DividendEntry {
  channelId: string;
  streamerName: string;
  profileImageUrl: string;
  totalDividendPool: number;
  streamMinutes: number;
  createdAt: string;
}

export function useDividends() {
  const [dividends, setDividends] = useState<DividendEntry[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/dividends/recent`)
      .then(r => r.json())
      .then(setDividends)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const subscription = subscribeStomp('/topic/dividends', (message) => {
      try {
        const entry: DividendEntry = JSON.parse(message.body);
        setDividends(prev => [entry, ...prev].slice(0, 30));
      } catch (e) {
        console.error('Failed to parse dividend message', e);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return dividends;
}
