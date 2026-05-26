/** 종목(스트리머) 데이터 구조. 백엔드 REST + STOMP 응답을 정규화한 형태
 *  Normalized shape of a streamer/stock, sourced from REST and STOMP responses */
export interface Stock {
  /** 치지직 채널 ID (primary key) / Chzzk channel ID used as primary key */
  id: string;
  /** 스트리머 표시 이름 / Streamer display name */
  name: string;
  /** 현재 주가 (원) / Current stock price in KRW */
  price: number;
  /** 일간 누적 거래량 / Daily cumulative trading volume */
  totalVolume: number;
  /** 상장 기준가 (등락률 계산 기준) / Base price used for return calculation */
  basePrice?: number;
  /** 팔로워 수 / Number of followers */
  followers?: number;
  /** 프로필 이미지 URL / Profile image URL */
  profileImageUrl?: string;
  /** 현재 라이브 방송 여부 / Whether the streamer is currently live */
  isLive?: boolean;
  /** 총 발행 주식 수 / Total issued share count */
  totalSupply?: number;
  /** 방송 기반 기준 시간(시간 단위) / Base broadcast hours for dividend calculation */
  baseBroadcastHours?: number;
  /** 라이브 방송 시작 시각 (ISO 8601) / Live start time in ISO 8601 */
  liveStartedAt?: string;
  /** 현재 라이브에서 누적된 배당 횟수 / Accumulated dividend count in the current live session */
  dividendAccumulationCount?: number;
  /** 라이브 시작 전 유통 물량 / Float supply before live started */
  preStreamFloat?: number;
  /** 종목 상장일 (ISO 8601) / Listing date in ISO 8601 */
  listedAt?: string;
}

/** 초기 렌더링용 기본 종목 배열. 실제 데이터는 백엔드 API에서 불러옴
 *  Default empty stock list; actual data is fetched from the backend API */
export const DEFAULT_STOCKS: Stock[] = [];
