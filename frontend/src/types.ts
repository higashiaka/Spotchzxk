// 여러 화면에서 공유하는 앱 탭과 실시간 거래 이벤트 타입입니다.
export type AppTab = 'home' | 'prices' | 'order' | 'chart' | 'profile' | 'shop';

export interface LiveTrade {
  streamerId: string;
  streamerName: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: number;
}
