'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useLiveTrades } from '@/hooks/useLiveTrades';
import { useStocks } from '@/hooks/useStocks';
import { StockDetail } from '@/components/prices/StockDetail';
import { Stock } from '@/data/stocks';
import { useMemo } from 'react';

export function StockDetailPage({ initialStock }: { initialStock: Stock }) {
  const router = useRouter();
  const { user } = useAuth();
  const streamers = useStocks();

  // 실시간 업데이트된 종목 데이터를 우선 사용, 없으면 SSR 초기 데이터
  const stock = useMemo(
    () => streamers.find(s => s.id === initialStock.id) ?? initialStock,
    [streamers, initialStock],
  );

  const streamerNameById = useMemo(
    () => new Map(streamers.map(s => [s.id, s.name])),
    [streamers],
  );
  const liveTrades = useLiveTrades(streamerNameById);

  const handleOrder = (type: 'buy' | 'sell') => {
    router.push(`/stocks/${stock.id}/order?type=${type}`);
  };

  return (
    <StockDetail
      streamer={stock}
      user={user}
      onOrder={handleOrder}
      liveTrades={liveTrades}
    />
  );
}
