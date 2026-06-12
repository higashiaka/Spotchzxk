import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { fetchStock } from '@/lib/serverApi';
import { StockOrderPage } from '@/components/stocks/StockOrderPage';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const stock = await fetchStock(id);
  if (!stock) return { title: '종목을 찾을 수 없습니다' };
  return { title: `${stock.name} 주문 — Spotchzxk` };
}

export default async function StockOrderRoute({ params }: Props) {
  const { id } = await params;
  const stock = await fetchStock(id);
  if (!stock) notFound();

  return (
    <Suspense>
      <StockOrderPage initialStock={stock} />
    </Suspense>
  );
}
