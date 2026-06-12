import { useState, useEffect } from 'react';
import { subscribeStomp } from '@/lib/stompClient';

/** Real-time price state for a single stock */
export interface StockPriceData {
  /** Latest executed price */
  currentPrice: number;
  /** Previous price used to determine direction; null before first tick */
  previousPrice: number | null;
  /** Price movement direction */
  direction: 'up' | 'down' | 'none';
}

/** Tracks real-time price of a stock by subscribing to STOMP /topic/prices/{channelId}
 *  @param channelId - Channel ID of the stock to subscribe
 *  @param fallbackPrice - Default price shown before first tick */
export const useStockPrice = (channelId: string, fallbackPrice: number = 100): StockPriceData => {
  const [priceData, setPriceData] = useState<StockPriceData>({
    currentPrice: fallbackPrice,
    previousPrice: null,
    direction: 'none',
  });

  useEffect(() => {
    // Reset to fallbackPrice when channelId changes
    setPriceData({
      currentPrice: fallbackPrice,
      previousPrice: null,
      direction: 'none',
    });

    const subscription = subscribeStomp(`/topic/prices/${channelId}`, (message) => {
      try {
        const { price } = JSON.parse(message.body);
        const newPrice = Number(Number(price).toFixed(2));
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
    // fallbackPrice intentionally excluded: reset only when channelId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  return priceData;
};
