export const BASE_PRICE = 1000;
export const INITIAL_BALANCE = 1_000_000;

export const fmt = (value: number): string => {
  if (value < 1) return `${value.toFixed(2)}원`;
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
};

export const fmtCompact = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};

export const changePct = (price: number, basePrice: number = BASE_PRICE) =>
  ((price - basePrice) / basePrice) * 100;

export const grade = (assets: number): { label: string; color: string } => {
  if (assets >= 30_000_000) return { label: '다이아 리그', color: '#00BCD4' };
  if (assets >= 15_000_000) return { label: '플래티넘 리그', color: '#C0C0C0' };
  if (assets >= 12_000_000) return { label: '골드 리그', color: '#FFD700' };
  if (assets >= 10_000_000) return { label: '실버 리그', color: '#A8A8A8' };
  return { label: '브론즈 리그', color: '#CD7F32' };
};

export const priceColor = (pct: number) =>
  pct > 0 ? '#FF5252' : pct < 0 ? '#3D8BFF' : '#888888';

export const AVATAR_COLORS = [
  '#FF5252', '#3D8BFF', '#00E676', '#FFD700',
  '#FF9800', '#AB47BC', '#00BCD4', '#F06292',
];

export const avatarColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};
