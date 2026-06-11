/** Default base price for new stocks in KRW */
export const BASE_PRICE = 1000;

/** Formats a number as Korean KRW string; shows 2 decimal places below 1 KRW */
export const fmt = (value: number): string => {
  if (value < 1) return `${value.toFixed(2)}원`;
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
};

/** Abbreviates large numbers with K/M suffix (e.g. 1,200 → 1.2K) */
export const fmtCompact = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};

/** Abbreviates large KRW amounts with Korean-style short units (e.g. 140,000,000 KRW → "1.4 hundred million") */
export const fmtCompactWon = (value: number): string => {
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 100_000_000) {
    return `${(rounded / 100_000_000).toFixed(1).replace(/\.0$/, '')}억`;
  }
  if (Math.abs(rounded) >= 10_000) {
    return `${(rounded / 10_000).toFixed(1).replace(/\.0$/, '')}만`;
  }
  return fmt(rounded);
};

/** Formats a KRW amount with Korean units: 조 / 억 / 천만 / 만 (e.g. 123,456,789 → "1.23억원") */
export const fmtKorean = (value: number): string => {
  const abs = Math.abs(Math.round(value));
  const trim = (s: string) => s.replace(/\.?0+$/, '');
  if (abs >= 1_000_000_000_000) return `${trim((value / 1_000_000_000_000).toFixed(2))}조원`;
  if (abs >= 100_000_000)       return `${trim((value / 100_000_000).toFixed(2))}억원`;
  if (abs >= 10_000_000)        return `${trim((value / 10_000_000).toFixed(2))}천만원`;
  if (abs >= 10_000)            return `${trim((value / 10_000).toFixed(1))}만원`;
  return fmt(value);
};

/** Calculates percentage return relative to the base price */
export const changePct = (price: number, basePrice: number = BASE_PRICE) =>
  ((price - basePrice) / basePrice) * 100;

/** Returns LoL-style tier label and color based on relative rank among all users */
export const grade = (rank: number, total: number): { label: string; color: string } => {
  if (total === 0) return { label: '아이언', color: '#6B6B6B' };
  const pct = ((total - rank) / total) * 100;
  if (pct >= 99)   return { label: '챌린저', color: '#FF8C00' };
  if (pct >= 97)   return { label: '그랜드마스터', color: '#F44336' };
  if (pct >= 94)   return { label: '마스터', color: '#9C27B0' };
  if (pct >= 88)   return { label: '다이아몬드', color: '#00BCD4' };
  if (pct >= 75)   return { label: '에메랄드', color: '#2F80ED' };
  if (pct >= 55)   return { label: '플래티넘', color: '#00BFA5' };
  if (pct >= 35)   return { label: '골드', color: '#FFD700' };
  if (pct >= 18)   return { label: '실버', color: '#C0C0C0' };
  if (pct >= 7)    return { label: '브론즈', color: '#CD7F32' };
  return { label: '아이언', color: '#6B6B6B' };
};

/** Returns display color based on price change: red for up, blue for down, gray for flat */
export const priceColor = (pct: number) =>
  pct > 0 ? '#FF5252' : pct < 0 ? '#3D8BFF' : '#888888';

/** Fixed color palette used for avatar backgrounds */
export const AVATAR_COLORS = [
  '#FF5252', '#3D8BFF', '#2F80ED', '#D4A017',
  '#FF9800', '#AB47BC', '#00BCD4', '#F06292',
];

/** Hashes a name string to consistently pick a color from the palette */
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
