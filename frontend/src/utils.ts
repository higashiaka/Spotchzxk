/** Default base price for new stocks in KRW */
export const BASE_PRICE = 1000;

/** Formats a number as Korean KRW string; shows 2 decimal places below 1 KRW */
export const fmt = (value: number): string => {
  if (value < 1) return `${value.toFixed(2)}원`;
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
};

/** Formats a bigint as Korean KRW string, safe for values above Number.MAX_SAFE_INTEGER */
export const fmtBigInt = (value: bigint): string => {
  return `${value.toLocaleString('ko-KR')}원`;
};

/** Parses a balance string (from backend) to bigint, dropping fractional part */
export const parseBigBalance = (value: string | number | undefined | null): bigint => {
  if (value == null) return 0n;
  const s = String(value).split('.')[0];
  try { return BigInt(s); } catch { return 0n; }
};

/** Formats a bigint as Korean units (자/해/경/조/억/만원), safe for any magnitude */
export const fmtKoreanBigInt = (value: bigint): string => {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const sign = neg ? '-' : '';
  const divFmt = (divisor: bigint, unit: string) => {
    const whole = abs / divisor;
    const frac = (abs % divisor) * 10n / divisor;
    return `${sign}${frac === 0n ? whole : `${whole}.${frac}`}${unit}`;
  };
  if (abs >= 10n ** 36n) return divFmt(10n ** 36n, '간원');
  if (abs >= 10n ** 32n) return divFmt(10n ** 32n, '구원');
  if (abs >= 10n ** 28n) return divFmt(10n ** 28n, '양원');
  if (abs >= 10n ** 24n) return divFmt(10n ** 24n, '자원');
  if (abs >= 10n ** 20n) return divFmt(10n ** 20n, '해원');
  if (abs >= 10n ** 16n) return divFmt(10n ** 16n, '경원');
  // Below 경, precision is safe with Number
  return fmtKorean(Number(value));
};

/** Abbreviates large numbers with K/M/B/T/Q/Qi/Sx/Sp/Oc/No suffix (e.g. 1,200 → 1.2K) */
export const fmtCompact = (n: number): string => {
  if (n >= 1e30) return `${(n / 1e30).toFixed(1).replace(/\.0$/, '')}No`;
  if (n >= 1e27) return `${(n / 1e27).toFixed(1).replace(/\.0$/, '')}Oc`;
  if (n >= 1e24) return `${(n / 1e24).toFixed(1).replace(/\.0$/, '')}Sp`;
  if (n >= 1e21) return `${(n / 1e21).toFixed(1).replace(/\.0$/, '')}Sx`;
  if (n >= 1e18) return `${(n / 1e18).toFixed(1).replace(/\.0$/, '')}Qi`;
  if (n >= 1e15) return `${(n / 1e15).toFixed(1).replace(/\.0$/, '')}Q`;
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '')}T`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};

/** Formats share quantities with Korean units while keeping the 주 suffix visible */
export const fmtShares = (value: number): string => {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  const trim = (s: string) => s.replace(/\.?0+$/, '');
  if (abs >= 1e36)              return `${trim((rounded / 1e36).toFixed(1))}간주`;
  if (abs >= 1e32)              return `${trim((rounded / 1e32).toFixed(1))}구주`;
  if (abs >= 1e28)              return `${trim((rounded / 1e28).toFixed(1))}양주`;
  if (abs >= 1e24)              return `${trim((rounded / 1e24).toFixed(1))}자주`;
  if (abs >= 1e20)              return `${trim((rounded / 1e20).toFixed(1))}해주`;
  if (abs >= 1e16)              return `${trim((rounded / 1e16).toFixed(1))}경주`;
  if (abs >= 1_000_000_000_000) return `${trim((rounded / 1_000_000_000_000).toFixed(1))}조주`;
  if (abs >= 100_000_000)       return `${trim((rounded / 100_000_000).toFixed(1))}억주`;
  if (abs >= 10_000)            return `${trim((rounded / 10_000).toFixed(1))}만주`;
  return `${rounded.toLocaleString('ko-KR')}주`;
};

/** Abbreviates large KRW amounts with Korean-style short units (e.g. 140,000,000 KRW → "1.4 hundred million") */
export const fmtCompactWon = (value: number): string => {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  if (abs >= 1e36) return `${(rounded / 1e36).toFixed(1).replace(/\.0$/, '')}간`;
  if (abs >= 1e32) return `${(rounded / 1e32).toFixed(1).replace(/\.0$/, '')}구`;
  if (abs >= 1e28) return `${(rounded / 1e28).toFixed(1).replace(/\.0$/, '')}양`;
  if (abs >= 1e24) return `${(rounded / 1e24).toFixed(1).replace(/\.0$/, '')}자`;
  if (abs >= 1e20) return `${(rounded / 1e20).toFixed(1).replace(/\.0$/, '')}해`;
  if (abs >= 1e16) return `${(rounded / 1e16).toFixed(1).replace(/\.0$/, '')}경`;
  if (abs >= 1_000_000_000_000) return `${(rounded / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '')}조`;
  if (abs >= 100_000_000) return `${(rounded / 100_000_000).toFixed(1).replace(/\.0$/, '')}억`;
  if (abs >= 10_000) return `${(rounded / 10_000).toFixed(1).replace(/\.0$/, '')}만`;
  return fmt(rounded);
};

/** Formats a KRW amount with Korean units: 해 / 경 / 조 / 억 / 천만 / 만 (e.g. 123,456,789 → "1.2억원") */
export const fmtKorean = (value: number): string => {
  const abs = Math.abs(Math.round(value));
  const trim = (s: string) => s.replace(/\.?0+$/, '');
  if (abs >= 1e36)              return `${trim((value / 1e36).toFixed(1))}간원`;
  if (abs >= 1e32)              return `${trim((value / 1e32).toFixed(1))}구원`;
  if (abs >= 1e28)              return `${trim((value / 1e28).toFixed(1))}양원`;
  if (abs >= 1e24)              return `${trim((value / 1e24).toFixed(1))}자원`;
  if (abs >= 1e20)              return `${trim((value / 1e20).toFixed(1))}해원`;
  if (abs >= 1e16)              return `${trim((value / 1e16).toFixed(1))}경원`;
  if (abs >= 1_000_000_000_000) return `${trim((value / 1_000_000_000_000).toFixed(1))}조원`;
  if (abs >= 100_000_000)       return `${trim((value / 100_000_000).toFixed(1))}억원`;
  if (abs >= 10_000_000)        return `${trim((value / 10_000_000).toFixed(2))}천만원`;
  if (abs >= 10_000)            return `${trim((value / 10_000).toFixed(1))}만원`;
  return fmt(value);
};

/** Calculates percentage return relative to the base price */
export const changePct = (price: number, basePrice: number = BASE_PRICE) =>
  ((price - basePrice) / basePrice) * 100;

/** Formats a percentage with sign and abbreviation for large values */
export const fmtPct = (pct: number, decimals: number = 1): string => {
  const sign = pct >= 0 ? '+' : '';
  const abs = Math.abs(pct);
  const trim = (s: string) => s.replace(/\.?0+$/, '');
  if (abs >= 1e36)              return `${sign}${trim((pct / 1e36).toFixed(1))}간%`;
  if (abs >= 1e32)              return `${sign}${trim((pct / 1e32).toFixed(1))}구%`;
  if (abs >= 1e28)              return `${sign}${trim((pct / 1e28).toFixed(1))}양%`;
  if (abs >= 1e24)              return `${sign}${trim((pct / 1e24).toFixed(1))}자%`;
  if (abs >= 1e20)              return `${sign}${trim((pct / 1e20).toFixed(1))}해%`;
  if (abs >= 1e16)              return `${sign}${trim((pct / 1e16).toFixed(1))}경%`;
  if (abs >= 1_000_000_000_000) return `${sign}${trim((pct / 1_000_000_000_000).toFixed(1))}조%`;
  if (abs >= 100_000_000)       return `${sign}${trim((pct / 100_000_000).toFixed(1))}억%`;
  if (abs >= 10_000)            return `${sign}${trim((pct / 10_000).toFixed(1))}만%`;
  return `${sign}${pct.toFixed(decimals)}%`;
};

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
