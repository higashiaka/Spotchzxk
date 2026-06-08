import { useState, useEffect } from 'react';
import { API_BASE } from '../lib/api';
import { subscribeStomp } from '../lib/stompClient';

/** Data structure for a single dividend payment record */
export interface DividendEntry {
  /** Channel ID of the dividend-paying streamer */
  channelId: string;
  /** Streamer name */
  streamerName: string;
  /** Streamer profile image URL */
  profileImageUrl: string;
  /** Total dividend pool for this payout event in KRW */
  totalDividendPool: number;
  /** Stream duration in minutes for this broadcast */
  streamMinutes: number;
  /** Dividend payment time in ISO 8601 */
  createdAt: string;
}

/** Initially loads recent dividend history via REST,
 *  then receives new dividend events in real-time via STOMP /topic/dividends
 *  (maintains at most 30 entries in memory) */
export function useDividends() {
  const [dividends, setDividends] = useState<DividendEntry[]>([]);

  // Initial history load
  useEffect(() => {
    fetch(`${API_BASE}/api/dividends/recent`)
      .then(r => r.json())
      .then(setDividends)
      .catch(() => {});
  }, []);

  // Real-time new dividend events
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
