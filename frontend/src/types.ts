/** 앱 전체에서 사용하는 탭 식별자
 *  Tab identifiers used across the entire app */
export type AppTab = 'home' | 'prices' | 'order' | 'chart' | 'profile' | 'shop';

/** STOMP를 통해 실시간으로 수신되는 체결 이벤트
 *  Live trade event received via STOMP WebSocket */
export interface LiveTrade {
  /** 스트리머 채널 ID / Streamer channel ID */
  streamerId: string;
  /** 스트리머 이름 / Streamer display name */
  streamerName: string;
  /** 매수 또는 매도 구분 / Buy or sell direction */
  type: 'buy' | 'sell';
  /** 체결 수량 / Executed quantity */
  quantity: number;
  /** 체결 가격 / Executed price */
  price: number;
  /** 체결 시각 (Unix ms) / Execution timestamp in Unix ms */
  timestamp: number;
}
