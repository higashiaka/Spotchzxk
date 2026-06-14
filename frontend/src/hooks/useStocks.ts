import { useState, useEffect } from 'react';
import { DEFAULT_STOCKS, Stock } from '../data/stocks';
import { subscribeStomp, registerOnConnect } from '../lib/stompClient';
import { apiFetch } from '../lib/api';
import { LiveTrade } from '../types';

export type { Stock } from '../data/stocks';
export { DEFAULT_STOCKS };

/** Maps a raw backend response object to the client-side Stock model */
function mapRawToStock(r: any): Stock {
  return {
    id: r.channelId || r.id,
    name: r.streamerName || r.name,
    price: Number(r.currentPrice ?? r.price ?? 1000),
    totalVolume: Number(r.dailyVolume ?? r.totalVolume ?? 0),
    dailyTradingValue: Number(r.dailyTradingValue ?? 0),
    basePrice: Number(r.basePrice ?? 1000),
    followers: Number(r.followerCount ?? r.followers ?? 0),
    listingPrice: Number(r.listingPrice ?? 0),
    profileImageUrl: r.profileImageUrl,
    isLive: r.isLive ?? false,
    totalSupply: Number(r.totalSupply ?? 0),
    baseBroadcastHours: Number(r.baseBroadcastHours ?? 1),
    liveStartedAt: r.liveStartedAt ?? null,
    dividendAccumulationCount: Number(r.dividendAccumulationCount ?? 0),
    preStreamFloat: Number(r.preStreamFloat ?? 0),
    coinReserve: String(r.coinReserve ?? '0'),
    shareReserve: String(r.shareReserve ?? '0'),
    listedAt: r.listedAt ?? null,
    tradingSuspended: r.tradingSuspended ?? false,
  };
}

/** Hook that manages the full list of stocks.
 *  Fetches all stocks via REST on mount, then applies
 *  real-time merge updates from STOMP /topic/streamers and /topic/trades */
export const useStocks = () => {
  const [stocks, setStocks] = useState<Stock[]>(DEFAULT_STOCKS);

  // Fetch stocks on initial connect and every reconnect to pick up daily resets
  useEffect(() => {
    const fetchStocks = () => {
      apiFetch('/api/stocks')
        .then(res => res.ok ? res.json() : null)
        .then((rawStocks: any[] | null) => {
          if (!rawStocks || rawStocks.length === 0) return;
          setStocks(rawStocks.map(mapRawToStock));
        })
        .catch(() => {});
    };
    return registerOnConnect(fetchStocks);
  }, []);

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
        // Append stocks that exist in DB but not in prev
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
            dailyTradingValue: stock.dailyTradingValue + Number(trade.tradingValue ?? 0),
            coinReserve: trade.coinReserve ?? stock.coinReserve,
            shareReserve: trade.shareReserve ?? stock.shareReserve,
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
