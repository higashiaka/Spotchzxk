import { useState, useEffect } from 'react';
import { subscribeStomp } from '../lib/stompClient';

/** 개별 종목의 실시간 가격 상태
 *  Real-time price state for a single stock */
export interface StockPriceData {
  /** 최신 체결가 / Latest executed price */
  currentPrice: number;
  /** 이전 체결가 (방향 계산용). 첫 수신 전은 null
   *  Previous price used to determine direction; null before first tick */
  previousPrice: number | null;
  /** 가격 방향 (상승/하락/보합) / Price movement direction */
  direction: 'up' | 'down' | 'none';
}

/** STOMP /topic/prices/{channelId} 를 구독해 종목의 실시간 가격을 추적
 *  Tracks real-time price of a stock by subscribing to STOMP /topic/prices/{channelId}
 *  @param channelId - 구독할 종목의 채널 ID / Channel ID of the stock to subscribe
 *  @param fallbackPrice - 첫 메시지 수신 전 표시할 기본 가격 / Default price shown before first tick */
export const useStockPrice = (channelId: string, fallbackPrice: number = 100): StockPriceData => {
  const [priceData, setPriceData] = useState<StockPriceData>({
    currentPrice: fallbackPrice,
    previousPrice: null,
    direction: 'none',
  });

  useEffect(() => {
    // channelId 변경 시 fallbackPrice로 초기화
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
    // fallbackPrice는 의도적으로 deps 제외: channelId 변경 시에만 초기화
    // fallbackPrice intentionally excluded: reset only when channelId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  return priceData;
};
