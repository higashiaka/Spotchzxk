// 개별 종목의 현재가를 실시간 스트림에서 찾아 컴포넌트에 제공합니다.
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
    // fallbackPrice는 의도적으로 제외: channelId 변경 시에만 초기화, 가격 업데이트마다 리셋 방지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  return priceData;
};
