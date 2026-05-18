import { useState, useEffect } from 'react';
import { subscribeStomp } from '../lib/stompClient';

export interface StockPriceData {
  currentPrice: number;
  previousPrice: number | null;
  direction: 'up' | 'down' | 'none';
}

export const useStockPrice = (channelId: string, fallbackPrice: number = 100): StockPriceData => {
  const [priceData, setPriceData] = useState<StockPriceData>({
    currentPrice: fallbackPrice,
    previousPrice: null,
    direction: 'none',
  });

  useEffect(() => {
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
  }, [channelId]);

  return priceData;
};
