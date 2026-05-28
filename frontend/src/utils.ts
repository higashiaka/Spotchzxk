/** 초기 종목 기준가 (원) / Default base price for new stocks in KRW */
export const BASE_PRICE = 1000;

/** 게임 시작 시 지급되는 초기 투자금 (원) / Initial investment balance given at game start in KRW */
export const INITIAL_BALANCE = 1_000_000;

/** 숫자를 한국어 원화 형식으로 포맷 (1원 미만은 소수 2자리 표시)
 *  Formats a number as Korean KRW string; shows 2 decimal places below 1 KRW */
export const fmt = (value: number): string => {
  if (value < 1) return `${value.toFixed(2)}원`;
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
};

/** 큰 숫자를 K/M 단위로 축약 (예: 1,200 → 1.2K)
 *  Abbreviates large numbers with K/M suffix (e.g. 1,200 → 1.2K) */
export const fmtCompact = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};

/** 기준가 대비 현재가 등락률(%) 계산
 *  Calculates percentage return relative to the base price */
export const changePct = (price: number, basePrice: number = BASE_PRICE) =>
  ((price - basePrice) / basePrice) * 100;

/** 전체 유저 중 상대 순위(rank: 1-indexed)를 기준으로 LoL 티어 라벨과 색상 반환
 *  Returns LoL-style tier label and color based on relative rank among all users */
export const grade = (rank: number, total: number): { label: string; color: string } => {
  if (total === 0) return { label: '아이언', color: '#6B6B6B' };
  const pct = ((total - rank) / total) * 100;
  if (pct >= 99)   return { label: '챌린저', color: '#FF8C00' };
  if (pct >= 97)   return { label: '그랜드마스터', color: '#F44336' };
  if (pct >= 94)   return { label: '마스터', color: '#9C27B0' };
  if (pct >= 88)   return { label: '다이아몬드', color: '#00BCD4' };
  if (pct >= 75)   return { label: '에메랄드', color: '#00E676' };
  if (pct >= 55)   return { label: '플래티넘', color: '#00BFA5' };
  if (pct >= 35)   return { label: '골드', color: '#FFD700' };
  if (pct >= 18)   return { label: '실버', color: '#C0C0C0' };
  if (pct >= 7)    return { label: '브론즈', color: '#CD7F32' };
  return { label: '아이언', color: '#6B6B6B' };
};

/** 등락률에 따른 색상 반환 (상승 빨강, 하락 파랑, 보합 회색)
 *  Returns display color based on price change: red for up, blue for down, gray for flat */
export const priceColor = (pct: number) =>
  pct > 0 ? '#FF5252' : pct < 0 ? '#3D8BFF' : '#888888';

/** 아바타 배경에 사용되는 고정 색상 팔레트
 *  Fixed color palette used for avatar backgrounds */
export const AVATAR_COLORS = [
  '#FF5252', '#3D8BFF', '#00E676', '#FFD700',
  '#FF9800', '#AB47BC', '#00BCD4', '#F06292',
];

/** 이름 문자열을 해시해 팔레트에서 일관된 색상을 선택
 *  Hashes a name string to consistently pick a color from the palette */
export const avatarColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

export const priceColorClass = (pct: number): string =>
  pct > 0 ? 'tone-positive' : pct < 0 ? 'tone-negative' : 'tone-flat';

export const tradeColorClass = (type: 'buy' | 'sell'): string =>
  type === 'buy' ? 'trade-buy' : 'trade-sell';

export const tradeBadgeClass = (type: 'buy' | 'sell'): string =>
  type === 'buy' ? 'trade-buy-badge' : 'trade-sell-badge';

export const avatarColorClass = (name: string, hasImage?: boolean): string => {
  if (hasImage) return 'avatar-transparent';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return `avatar-color-${Math.abs(hash) % AVATAR_COLORS.length}`;
};
