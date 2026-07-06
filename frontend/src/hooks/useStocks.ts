import { useState, useEffect } from 'react';
import { DEFAULT_STOCKS, Stock } from '../data/stocks';
import { subscribeStomp, registerOnConnect } from '../lib/stompClient';
import { apiFetch } from '../lib/api';
import { LiveTrade } from '../types';

export type { Stock } from '../data/stocks';
export { DEFAULT_STOCKS };

/** Maps a raw backend response object to the client-side Stock model */
const toFiniteNumber = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toPositivePrice = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const toAmmPrice = (coinReserve: unknown, shareReserve: unknown): number | null => {
  const coin = Number(coinReserve);
  const share = Number(shareReserve);
  if (!Number.isFinite(coin) || !Number.isFinite(share) || coin <= 0 || share <= 0) {
    return null;
  }
  const price = coin / share;
  return Number.isFinite(price) && price > 0 ? price : null;
};

const stockIdOf = (r: any, previous?: Stock): string | null => {
  const id = r.channelId || r.id || previous?.id;
  return typeof id === 'string' && id.trim() ? id : null;
};

export function mapRawToStock(r: any, previous?: Stock): Stock | null {
  const id = stockIdOf(r, previous);
  if (!id) return null;

  const fallbackPrice = previous?.price && previous.price > 0 ? previous.price : 1000;
  const coinReserve = String(r.coinReserve ?? previous?.coinReserve ?? '0');
  const shareReserve = String(r.shareReserve ?? previous?.shareReserve ?? '0');
  const ammPrice = toAmmPrice(coinReserve, shareReserve);

  return {
    id,
    name: r.streamerName || r.name || previous?.name,
    price: ammPrice ?? toPositivePrice(r.currentPrice ?? r.price, fallbackPrice),
    totalVolume: toFiniteNumber(r.dailyVolume ?? r.totalVolume, previous?.totalVolume ?? 0),
    dailyTradingValue: toFiniteNumber(r.dailyTradingValue, previous?.dailyTradingValue ?? 0),
    basePrice: toPositivePrice(r.basePrice, previous?.basePrice ?? 1000),
    followers: toFiniteNumber(r.followerCount ?? r.followers, previous?.followers ?? 0),
    listingPrice: toFiniteNumber(r.listingPrice, previous?.listingPrice ?? 0),
    profileImageUrl: r.profileImageUrl ?? previous?.profileImageUrl,
    isLive: r.isLive ?? previous?.isLive ?? false,
    totalSupply: toFiniteNumber(r.totalSupply, previous?.totalSupply ?? 0),
    baseBroadcastHours: toFiniteNumber(r.baseBroadcastHours, previous?.baseBroadcastHours ?? 1),
    liveStartedAt: r.liveStartedAt ?? previous?.liveStartedAt ?? null,
    dividendAccumulationCount: toFiniteNumber(
      r.dividendAccumulationCount,
      previous?.dividendAccumulationCount ?? 0,
    ),
    nextDividendPerShare: toFiniteNumber(
      r.nextDividendPerShare,
      previous?.nextDividendPerShare ?? 0,
    ),
    preStreamFloat: toFiniteNumber(r.preStreamFloat, previous?.preStreamFloat ?? 0),
    coinReserve,
    shareReserve,
    listedAt: r.listedAt ?? previous?.listedAt ?? null,
    tradingSuspended: r.tradingSuspended ?? previous?.tradingSuspended ?? false,
    tradingSuspensionReason: r.tradingSuspensionReason ?? previous?.tradingSuspensionReason ?? null,
  };
}

/** Hook that manages the full list of stocks.
 *  Fetches all stocks via REST on mount, then applies
 *  real-time merge updates from STOMP /topic/streamers and /topic/trades */
export const useStocks = () => {
  const [stocks, setStocks] = useState<Stock[]>(DEFAULT_STOCKS);
  const [stocksLoading, setStocksLoading] = useState(true);

  // Fetch stocks immediately via REST, then again on STOMP reconnect to pick up daily resets.
  useEffect(() => {
    let active = true;
    const fetchStocks = () => {
      apiFetch('/api/stocks')
        .then(res => res.ok ? res.json() : null)
        .then((rawStocks: any[] | null) => {
          if (!active) return;
          if (rawStocks && rawStocks.length > 0) {
            setStocks(prev => {
              const prevById = new Map(prev.map(stock => [stock.id, stock]));
              return rawStocks
                .map(raw => mapRawToStock(raw, prevById.get(stockIdOf(raw) ?? '')))
                .filter((stock): stock is Stock => stock !== null);
            });
          }
          setStocksLoading(false);
        })
        .catch(() => { if (active) setStocksLoading(false); });
    };
    fetchStocks();
    const unregister = registerOnConnect(fetchStocks);
    return () => {
      active = false;
      unregister();
    };
  }, []);

  // Real-time update: subscribe to STOMP /topic/streamers
  useEffect(() => {
    const handleMessage = (rawStocks: any[]) => {
      if (!rawStocks || rawStocks.length === 0) return;

      setStocks(prev => {
        const prevMap = new Map(prev.map(s => [s.id, s]));
        const dbStocks = rawStocks
          .map(raw => mapRawToStock(raw, prevMap.get(stockIdOf(raw) ?? '')))
          .filter((stock): stock is Stock => stock !== null);
        const dbMap = new Map(dbStocks.map(s => [s.id, s]));
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
          const coinReserve = trade.coinReserve ?? stock.coinReserve;
          const shareReserve = trade.shareReserve ?? stock.shareReserve;
          const ammPrice = toAmmPrice(coinReserve, shareReserve);
          const dailyVolume = trade.dailyVolume !== undefined
            ? Number(trade.dailyVolume)
            : stock.totalVolume + Number(trade.quantity);
          const dailyTradingValue = trade.dailyTradingValue !== undefined
            ? Number(trade.dailyTradingValue)
            : stock.dailyTradingValue + Number(trade.tradingValue ?? 0);
          const hasSuspensionReason = Object.prototype.hasOwnProperty.call(trade, 'tradingSuspensionReason');
          return {
            ...stock,
            price: ammPrice ?? toPositivePrice(trade.price, stock.price),
            totalVolume: dailyVolume,
            dailyTradingValue,
            coinReserve,
            shareReserve,
            tradingSuspended: trade.tradingSuspended ?? stock.tradingSuspended,
            tradingSuspensionReason: hasSuspensionReason
              ? trade.tradingSuspensionReason ?? null
              : stock.tradingSuspensionReason,
          };
        }));
      } catch (e) {
        console.error('Failed to parse trade message for stocks update', e);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { stocks, stocksLoading };
};
