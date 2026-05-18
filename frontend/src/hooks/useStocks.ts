import { useState, useEffect } from 'react';
import { DEFAULT_STOCKS, Stock } from '../data/stocks';
import { subscribeStomp } from '../lib/stompClient';
import { apiFetch } from '../lib/api';

export type { Stock } from '../data/stocks';
export { DEFAULT_STOCKS };

export const useStocks = () => {
  const [stocks, setStocks] = useState<Stock[]>(DEFAULT_STOCKS);

  // 초기 로드: REST API로 DB 전체 목록 가져오기
  useEffect(() => {
    apiFetch('/api/stocks')
      .then(res => res.ok ? res.json() : null)
      .then((rawStocks: any[] | null) => {
        if (!rawStocks || rawStocks.length === 0) return;
        const dbStocks: Stock[] = rawStocks.map(r => ({
          id: r.channelId || r.id,
          name: r.streamerName || r.name,
          price: r.currentPrice ?? r.price ?? 1000,
          totalVolume: Number(r.dailyVolume ?? r.totalVolume ?? 0),
          basePrice: r.basePrice ?? 1000,
          profileImageUrl: r.profileImageUrl,
        }));
        setStocks(dbStocks);
      })
      .catch(() => {/* 오프라인일 때는 DEFAULT_STOCKS 유지 */});
  }, []);

  // 실시간 업데이트: STOMP
  useEffect(() => {
    const handleMessage = (rawStocks: any[]) => {
      if (!rawStocks || rawStocks.length === 0) return;
      const dbStocks: Stock[] = rawStocks.map(r => ({
        id: r.channelId || r.id,
        name: r.streamerName || r.name,
        price: r.currentPrice ?? r.price ?? 1000,
        totalVolume: Number(r.dailyVolume ?? r.totalVolume ?? 0),
        basePrice: r.basePrice ?? 1000,
        profileImageUrl: r.profileImageUrl,
      }));
      const dbMap = new Map(dbStocks.map(s => [s.id, s]));

      setStocks(prev => {
        const merged = prev.map(s => {
          const db = dbMap.get(s.id);
          return db ? { ...s, price: db.price, totalVolume: db.totalVolume, basePrice: db.basePrice, profileImageUrl: db.profileImageUrl } : s;
        });
        // DB에만 있는 새 종목 추가 (prev에 없는 것)
        const prevIds = new Set(prev.map(s => s.id));
        dbStocks.forEach(s => {
          if (!prevIds.has(s.id)) merged.push(s);
        });
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

  return stocks;
};
