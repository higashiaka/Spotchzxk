import { useState, useEffect } from 'react';
import { API_BASE } from '../lib/api';

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

  return dividends;
}
