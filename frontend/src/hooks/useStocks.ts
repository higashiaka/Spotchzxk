import { useState, useEffect } from 'react';
import { DEFAULT_STOCKS, Stock } from '../data/stocks';
import { subscribeStomp } from '../lib/stompClient';
import { apiFetch } from '../lib/api';
import { LiveTrade } from '../types';

export type { Stock } from '../data/stocks';
export { DEFAULT_STOCKS };

/** 백엔드 REST 응답을 클라이언트 Stock 모델로 변환
 *  Maps a raw backend response object to the client-side Stock model */
function mapRawToStock(r: any): Stock {
  return {
    id: r.channelId || r.id,
    name: r.streamerName || r.name,
    price: r.currentPrice ?? r.price ?? 1000,
    totalVolume: Number(r.dailyVolume ?? r.totalVolume ?? 0),
    basePrice: r.basePrice ?? 1000,
    profileImageUrl: r.profileImageUrl,
    isLive: r.isLive ?? false,
    totalSupply: Number(r.totalSupply ?? 0),
    baseBroadcastHours: Number(r.baseBroadcastHours ?? 1),
    liveStartedAt: r.liveStartedAt ?? null,
    dividendAccumulationCount: Number(r.dividendAccumulationCount ?? 0),
    preStreamFloat: Number(r.preStreamFloat ?? 0),
    listedAt: r.listedAt ?? null,
  };
}

/** 종목 목록을 관리하는 훅.
 *  마운트 시 REST API로 전체 종목을 초기 로드하고,
 *  이후 STOMP /topic/streamers 및 /topic/trades 메시지로 실시간 병합 업데이트
 *
 *  Hook that manages the full list of stocks.
 *  Fetches all stocks via REST on mount, then applies
 *  real-time merge updates from STOMP /topic/streamers and /topic/trades */
export const useStocks = () => {
  const [stocks, setStocks] = useState<Stock[]>(DEFAULT_STOCKS);

  // 초기 로드: REST API로 DB 전체 목록 가져오기
  // Initial load: fetch all stocks from the REST API
  useEffect(() => {
    apiFetch('/api/stocks')
      .then(res => res.ok ? res.json() : null)
      .then((rawStocks: any[] | null) => {
        if (!rawStocks || rawStocks.length === 0) return;
        setStocks(rawStocks.map(mapRawToStock));
      })
      .catch(() => {/* 오프라인일 때는 DEFAULT_STOCKS 유지 / Keep DEFAULT_STOCKS when offline */});
  }, []);

  // 실시간 업데이트: STOMP /topic/streamers 구독
  // Real-time update: subscribe to STOMP /topic/streamers
  useEffect(() => {
    const handleMessage = (rawStocks: any[]) => {
      if (!rawStocks || rawStocks.length === 0) return;
      const dbStocks = rawStocks.map(mapRawToStock);
      const dbMap = new Map(dbStocks.map(s => [s.id, s]));

      setStocks(prev => {
        const merged = prev.map(s => {
          const db = dbMap.get(s.id);
          return db ? { ...s, ...db } : s;
        });
        // DB에만 있는 새 종목 추가 / Append stocks that exist in DB but not in prev
        const prevIds = new Set(prev.map(s => s.id));
        dbStocks.forEach(s => { if (!prevIds.has(s.id)) merged.push(s); });
        return merged;
      });
    };

    const subscription = subscribeStomp('/topic/streamers', (message) => {
      try {
        handleMessage(JSON.parse(message.body));
      } catch (e) {
        console.error('Failed to parse stocks message', e);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 체결 이벤트 반영: 가격과 일간 거래량을 즉시 갱신해 차트/랭킹을 실시간 재정렬
  // Apply trade events immediately so chart/ranking views re-sort in real time
  useEffect(() => {
    const subscription = subscribeStomp('/topic/trades', (message) => {
      try {
        const trade = JSON.parse(message.body) as LiveTrade;
        setStocks(prev => prev.map(stock => {
          if (stock.id !== trade.streamerId) return stock;
          return {
            ...stock,
            price: Number(trade.price),
            totalVolume: stock.totalVolume + Number(trade.quantity),
          };
        }));
      } catch (e) {
        console.error('Failed to parse trade message for stocks update', e);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return stocks;
};
