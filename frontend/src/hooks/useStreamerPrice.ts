import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export interface StreamerPriceData {
  currentPrice: number;
  previousPrice: number | null;
  direction: 'up' | 'down' | 'none';
}

export const useStreamerPrice = (streamerId: string, fallbackPrice: number = 100): StreamerPriceData => {
  const [priceData, setPriceData] = useState<StreamerPriceData>({
    currentPrice: fallbackPrice,
    previousPrice: null,
    direction: 'none'
  });

  useEffect(() => {
    const streamerRef = doc(db, 'streamers', streamerId);
    const unsubscribe = onSnapshot(streamerRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().price) {
        const newPrice = Number(docSnap.data().price.toFixed(2));
        
        setPriceData(prev => {
          if (prev.currentPrice === newPrice) return prev;
          
          let newDirection: 'up' | 'down' | 'none' = 'none';
          if (newPrice > prev.currentPrice) newDirection = 'up';
          else if (newPrice < prev.currentPrice) newDirection = 'down';

          return {
            currentPrice: newPrice,
            previousPrice: prev.currentPrice,
            direction: newDirection
          };
        });
      }
    }, (err: Error) => {
      console.error("Failed to subscribe to streamer price. Is your Firebase configuration correct?", err);
    });

    return () => unsubscribe();
  }, [streamerId]);

  return priceData;
};
