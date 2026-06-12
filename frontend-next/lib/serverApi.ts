import { Stock } from '@/data/stocks';

const SERVER_API = process.env.PROXY_TARGET || 'https://spotchzxk.xyz';

function mapRaw(r: any): Stock {
  return {
    id: r.channelId || r.id,
    name: r.streamerName || r.name,
    price: r.currentPrice ?? r.price ?? 1000,
    totalVolume: Number(r.dailyVolume ?? r.totalVolume ?? 0),
    dailyTradingValue: Number(r.dailyTradingValue ?? 0),
    basePrice: r.basePrice ?? 1000,
    followers: Number(r.followerCount ?? r.followers ?? 0),
    listingPrice: Number(r.listingPrice ?? 0),
    profileImageUrl: r.profileImageUrl,
    isLive: r.isLive ?? false,
    totalSupply: Number(r.totalSupply ?? 0),
    baseBroadcastHours: Number(r.baseBroadcastHours ?? 1),
    liveStartedAt: r.liveStartedAt ?? null,
    dividendAccumulationCount: Number(r.dividendAccumulationCount ?? 0),
    preStreamFloat: Number(r.preStreamFloat ?? 0),
    coinReserve: Number(r.coinReserve ?? 0),
    shareReserve: Number(r.shareReserve ?? 0),
    listedAt: r.listedAt ?? null,
  };
}

export async function fetchAllStocks(): Promise<Stock[]> {
  const res = await fetch(`${SERVER_API}/api/stocks`, { next: { revalidate: 60 } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data as any[]).map(mapRaw);
}

export async function fetchStock(id: string): Promise<Stock | null> {
  const stocks = await fetchAllStocks();
  return stocks.find(s => s.id === id) ?? null;
}
