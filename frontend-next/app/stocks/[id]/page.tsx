import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchStock, fetchAllStocks } from '@/lib/serverApi';
import { StockDetailPage } from '@/components/stocks/StockDetailPage';
import { fmt, changePct, priceColor } from '@/utils';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const stock = await fetchStock(id);
  if (!stock) return { title: '종목을 찾을 수 없습니다' };

  const pct = changePct(stock.price, stock.basePrice ?? stock.price);
  const sign = pct >= 0 ? '+' : '';
  const description = `현재가 ${fmt(stock.price)} (${sign}${pct.toFixed(2)}%) · 팔로워 ${stock.followers?.toLocaleString('ko-KR') ?? '-'}명`;

  return {
    title: `${stock.name} — Spotchzxk`,
    description,
    openGraph: {
      title: `${stock.name} 주식`,
      description,
      images: stock.profileImageUrl ? [{ url: stock.profileImageUrl }] : [],
    },
    twitter: {
      card: 'summary',
      title: `${stock.name} 주식`,
      description,
      images: stock.profileImageUrl ? [stock.profileImageUrl] : [],
    },
  };
}

export async function generateStaticParams() {
  const stocks = await fetchAllStocks();
  return stocks.map(s => ({ id: s.id }));
}

export default async function StockPage({ params }: Props) {
  const { id } = await params;
  const stock = await fetchStock(id);
  if (!stock) notFound();

  return (
    <div className="h-[100dvh] surface-app">
      <StockDetailPage initialStock={stock} />
    </div>
  );
}
