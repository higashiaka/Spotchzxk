'use client';

import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useStocks } from '@/hooks/useStocks';
import { OrderForm } from '@/components/order/OrderForm';
import { Stock } from '@/data/stocks';
import { useMemo, useState } from 'react';

export function StockOrderPage({ initialStock }: { initialStock: Stock }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const streamers = useStocks();

  const stock = useMemo(
    () => streamers.find(s => s.id === initialStock.id) ?? initialStock,
    [streamers, initialStock],
  );

  const initialType = searchParams.get('type') === 'sell' ? 'sell' : 'buy';
  const [qtyStr, setQtyStr] = useState('1');
  const [orderType, setOrderType] = useState<'buy' | 'sell'>(initialType);

  return (
    <div className="h-[100dvh] flex flex-col surface-sidebar">
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 px-4 py-2.5 shrink-0 text-sm font-bold transition-colors hover:opacity-70"
        style={{ color: 'var(--text-dim)', borderBottom: '1px solid #222A3A', background: 'var(--bg-sidebar)' }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
        </svg>
        이전 화면
      </button>
      <div className="flex-1 overflow-hidden">
        <OrderForm
          streamer={stock}
          user={user}
          qtyStr={qtyStr}
          setQtyStr={setQtyStr}
          orderType={orderType}
          setOrderType={setOrderType}
        />
      </div>
    </div>
  );
}
