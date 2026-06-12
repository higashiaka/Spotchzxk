import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { subscribeStomp } from '@/lib/stompClient';
import { LiveTrade } from '@/types';

const liveTradeKey = (trade: LiveTrade) =>
  trade.id ?? `${trade.streamerId}-${trade.timestamp}-${trade.type}-${trade.quantity}-${trade.price}`;

export function useLiveTrades(streamerNameById: Map<string, string>) {
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);

  useEffect(() => {
    apiFetch('/api/orders/recent')
      .then(res => res.ok ? res.json() : null)
      .then((rawOrders: any[] | null) => {
        if (!rawOrders) return;
        const initialTrades: LiveTrade[] = rawOrders.map(item => ({
          id: item.id,
          streamerId: item.streamerId,
          streamerName: item.streamerName ?? item.streamerId,
          type: item.type as 'buy' | 'sell',
          quantity: item.quantity,
          price: item.executedPrice ?? item.estimatedPrice,
          timestamp: item.createdAt,
        }));
        setLiveTrades(prev => {
          const merged = new Map<string, LiveTrade>();
          [...initialTrades, ...prev].forEach(trade => {
            merged.set(liveTradeKey(trade), trade);
          });
          return [...merged.values()]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 50);
        });
      })
      .catch(err => console.error('Failed to load recent orders', err));
  }, []);

  useEffect(() => {
    setLiveTrades(prev => {
      let changed = false;
      const renamed = prev.map(trade => {
        const streamerName = streamerNameById.get(trade.streamerId);
        if (!streamerName || trade.streamerName === streamerName) return trade;
        changed = true;
        return { ...trade, streamerName };
      });
      return changed ? renamed : prev;
    });
  }, [streamerNameById]);

  useEffect(() => {
    const subscription = subscribeStomp('/topic/trades', message => {
      try {
        const trade = JSON.parse(message.body) as LiveTrade;
        setLiveTrades(prev => {
          const key = liveTradeKey(trade);
          if (prev.some(item => liveTradeKey(item) === key)) return prev;
          return [trade, ...prev].slice(0, 50);
        });
      } catch (e) {
        console.error('Failed to parse trade message', e);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return liveTrades;
}
