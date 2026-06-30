import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
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

function isDividendEntry(value: any): value is DividendEntry {
  return !!value
    && typeof value.channelId === 'string'
    && typeof value.streamerName === 'string'
    && typeof value.profileImageUrl === 'string'
    && Number.isFinite(Number(value.totalDividendPool))
    && Number.isFinite(Number(value.streamMinutes))
    && typeof value.createdAt === 'string';
}

function dividendKey(entry: DividendEntry): string {
  return [
    entry.channelId,
    entry.createdAt,
    entry.totalDividendPool,
    entry.streamMinutes,
  ].join(':');
}

function mergeDividendEntries(...groups: DividendEntry[][]): DividendEntry[] {
  const byKey = new Map<string, DividendEntry>();
  groups.flat().forEach(entry => {
    if (isDividendEntry(entry)) byKey.set(dividendKey(entry), entry);
  });
  return Array.from(byKey.values())
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 30);
}

/** Initially loads recent dividend history via REST,
 *  then receives new dividend events in real-time via STOMP /topic/dividends
 *  (maintains at most 30 entries in memory) */
export function useDividends() {
  const [dividends, setDividends] = useState<DividendEntry[]>([]);

  // Initial history load
  useEffect(() => {
    apiFetch('/api/dividends/recent')
      .then(r => r.json())
      .then(entries => {
        if (!Array.isArray(entries)) return;
        setDividends(prev => mergeDividendEntries(prev, entries));
      })
      .catch(() => {});
  }, []);

  // Real-time new dividend events
  useEffect(() => {
    const subscription = subscribeStomp('/topic/dividends', (message) => {
      try {
        const entry = JSON.parse(message.body);
        if (!isDividendEntry(entry)) return;
        setDividends(prev => mergeDividendEntries([entry], prev));
      } catch (e) {
        console.error('Failed to parse dividend message', e);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return dividends;
}
