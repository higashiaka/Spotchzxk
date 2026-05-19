export interface Stock {
  id: string;
  name: string;
  price: number;
  totalVolume: number;
  basePrice?: number;
  followers?: number;
  profileImageUrl?: string;
  isLive?: boolean;
  dividendPool?: number;
  totalSupply?: number;
  liveStartedAt?: string;
  dividendAccumulationCount?: number;
  listedAt?: string;
}

// 기존 더미 종목을 다 지우고 빈 배열로 세팅합니다.
// 이제 백엔드 DB에서 등록된 실시간 종목만 깔끔하게 불어옵니다.
export const DEFAULT_STOCKS: Stock[] = [];
