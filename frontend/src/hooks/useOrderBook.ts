import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { subscribeStomp } from '../lib/stompClient';

export interface OrderBookEntry {
  price: number;
  quantity: number;
}

export interface OrderBookData {
  streamerId: string;
  currentPrice: number;
  asks: OrderBookEntry[];
  bids: OrderBookEntry[];
}

export const useOrderBook = (streamerId: string) => {
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!streamerId) return;

    setLoading(true);
    setError(null);

    const fetchOrderBook = async () => {
      try {
        const res = await apiFetch(`/api/stocks/${streamerId}/orderbook`);
        if (!res.ok) throw new Error('Failed to fetch order book');
        const data = await res.json();
        setOrderBook(data);
      } catch (err: any) {
        setError(err.message || 'Error loading order book');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderBook();

    // 웹소켓 실시간 구독
    const subscription = subscribeStomp(`/topic/orderbook/${streamerId}`, (msg) => {
      try {
        const data = JSON.parse(msg.body);
        setOrderBook(data);
      } catch (e) {
        console.error('Error parsing order book STOMP message:', e);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [streamerId]);

  return { orderBook, loading, error };
};
