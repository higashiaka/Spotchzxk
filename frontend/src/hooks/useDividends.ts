import { useState, useEffect } from 'react';
import { API_BASE } from '../lib/api';
import { subscribeStomp } from '../lib/stompClient';

/** 배당 지급 1건의 데이터 구조
 *  Data structure for a single dividend payment record */
export interface DividendEntry {
  /** 배당 스트리머의 채널 ID / Channel ID of the dividend-paying streamer */
  channelId: string;
  /** 스트리머 이름 / Streamer name */
  streamerName: string;
  /** 스트리머 프로필 이미지 URL / Streamer profile image URL */
  profileImageUrl: string;
  /** 해당 배당 이벤트의 총 배당 풀 (원) / Total dividend pool for this payout event in KRW */
  totalDividendPool: number;
  /** 해당 방송의 스트리밍 시간 (분) / Stream duration in minutes for this broadcast */
  streamMinutes: number;
  /** 배당 지급 시각 (ISO 8601) / Dividend payment time in ISO 8601 */
  createdAt: string;
}

/** 최근 배당 내역을 REST로 초기 로드하고,
 *  STOMP /topic/dividends 로 실시간 신규 배당 이벤트를 수신 (최대 30건 유지)
 *
 *  Initially loads recent dividend history via REST,
 *  then receives new dividend events in real-time via STOMP /topic/dividends
 *  (maintains at most 30 entries in memory) */
export function useDividends() {
  const [dividends, setDividends] = useState<DividendEntry[]>([]);

  // 초기 내역 로드 / Initial history load
  useEffect(() => {
    fetch(`${API_BASE}/api/dividends/recent`)
      .then(r => r.json())
      .then(setDividends)
      .catch(() => {});
  }, []);

  // 실시간 신규 배당 수신 / Real-time new dividend events
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
