import { useState, useEffect, useRef } from 'react';
import { subscribeStomp } from '../lib/stompClient';
import { toFiniteNumber } from '../utils';

/** Real-time price state for a single stock */
export interface StockPriceData {
  /** Latest executed price */
  currentPrice: number;
  /** Previous price used to determine direction; null before first tick */
  previousPrice: number | null;
  /** Price movement direction */
  direction: 'up' | 'down' | 'none';
}

const toPriceNumber = (value: unknown, fallback = 0): number => {
  const n = toFiniteNumber(value, fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Tracks real-time price of a stock by subscribing to STOMP /topic/prices/{channelId}.
 *  Also syncs with fallbackPrice (streamer.price) so that /topic/trades updates are
 *  reflected immediately even when /topic/prices arrives late or is dropped.
 *  @param channelId - Channel ID of the stock to subscribe
 *  @param fallbackPrice - External price source (e.g. from useStocks / /topic/trades) */
export const useStockPrice = (channelId: string, fallbackPrice: number = 100): StockPriceData => {
  const safeFallbackPrice = toPriceNumber(fallbackPrice, 100);
  const [priceData, setPriceData] = useState<StockPriceData>({
    currentPrice: safeFallbackPrice,
    previousPrice: null,
    direction: 'none',
  });

  // Tracks the last acknowledged price to detect genuine external updates.
  // Updated by both the STOMP subscription and the fallback sync effect,
  // so whichever arrives first wins and the other becomes a no-op.
  const prevFallbackRef = useRef(safeFallbackPrice);

  useEffect(() => {
    // Reset on channelId change — new stock, fresh state
    prevFallbackRef.current = safeFallbackPrice;
    setPriceData({
      currentPrice: safeFallbackPrice,
      previousPrice: null,
      direction: 'none',
    });

    const subscription = subscribeStomp(`/topic/prices/${channelId}`, (message) => {
      try {
        const { price } = JSON.parse(message.body);
        const newPrice = toPriceNumber(price);
        if (newPrice <= 0) return;
        // Sync ref so a subsequent fallback update with the same value is a no-op
        prevFallbackRef.current = newPrice;
        setPriceData(prev => {
          if (prev.currentPrice === newPrice) return prev;
          return {
            currentPrice: newPrice,
            previousPrice: prev.currentPrice,
            direction: newPrice > prev.currentPrice ? 'up' : 'down',
          };
        });
      } catch (e) {
        console.error('Failed to parse price message', e);
      }
    });

    return () => subscription.unsubscribe();
    // fallbackPrice intentionally excluded: channelId change is the only reset trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Secondary sync: streamer.price from /topic/trades or /topic/streamers.
  // Covers the case where /topic/prices arrives late or is dropped entirely.
  useEffect(() => {
    if (safeFallbackPrice <= 0) return;
    if (safeFallbackPrice === prevFallbackRef.current) return;
    prevFallbackRef.current = safeFallbackPrice;
    setPriceData(prev => {
      if (prev.currentPrice === safeFallbackPrice) return prev;
      return {
        currentPrice: safeFallbackPrice,
        previousPrice: prev.currentPrice,
        direction: safeFallbackPrice > prev.currentPrice ? 'up' : 'down',
      };
    });
  }, [safeFallbackPrice]);

  return priceData;
};
