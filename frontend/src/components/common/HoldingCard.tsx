import { Stock } from '../../hooks/useStocks';
import { fmt, priceColor, avatarColor } from '../../utils';

/** 보유 종목 카드 컴포넌트.
 *  variant에 따라 compact(목록용 한 줄) 또는 detail(카드 박스) 레이아웃을 렌더링
 *
 *  Holding position card component.
 *  Renders either compact (single-row list) or detail (card box) layout based on variant */
export const HoldingCard = ({
  streamer,
  qty,
  value,
  pct,
  avgPrice,
  variant = 'compact',
  onClick,
}: {
  /** 종목 데이터 / Stock data for this holding */
  streamer: Stock;
  /** 보유 수량 / Held quantity */
  qty: number;
  /** 평가 금액 (현재가 × 수량) / Market value (current price × quantity) */
  value: number;
  /** 평단가 대비 수익률 (%) / Return rate vs average purchase price in % */
  pct: number;
  /** 평균 매입 단가 / Average purchase price */
  avgPrice: number;
  /** 레이아웃 변형: 'compact'는 목록 한 줄, 'detail'은 카드 박스 (기본: compact)
   *  Layout variant: 'compact' for single-row list, 'detail' for card box (default: compact) */
  variant?: 'compact' | 'detail';
  /** 카드 클릭 핸들러 / Click handler for the card */
  onClick: () => void;
}) => {
  // 카드 박스 레이아웃 / Card box layout
  if (variant === 'detail') {
    return (
      <div
        className="rounded-xl border p-4 cursor-pointer"
        style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}
        onClick={onClick}
      >
        <div className="flex justify-between items-start">
          <div>
            <p className="text-white text-sm font-bold">{streamer.name}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {qty}주 · 평단 {fmt(avgPrice)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-bold text-sm font-mono text-white">{fmt(streamer.price)}</p>
            <p className="text-xs font-bold mt-1" style={{ color: priceColor(pct) }}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 한 줄 compact 레이아웃 / Single-row compact layout
  return (
    <div className="flex items-center gap-3 cursor-pointer" onClick={onClick}>
      {/* 프로필 이미지 또는 이니셜 아바타 / Profile image or initial avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black overflow-hidden"
        style={{ backgroundColor: streamer.profileImageUrl ? 'transparent' : avatarColor(streamer.name) }}
      >
        {streamer.profileImageUrl ? (
          <img src={streamer.profileImageUrl} alt={streamer.name} className="w-full h-full object-cover" />
        ) : (
          streamer.name.slice(0, 2)
        )}
      </div>

      {/* 종목명 및 보유 수량 / Stock name and held quantity */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-bold truncate">{streamer.name}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{qty}주</p>
      </div>

      {/* 평가금액 및 수익률 / Market value and return rate */}
      <div className="text-right shrink-0">
        <p className="font-mono font-bold text-sm text-white">{fmt(value)}</p>
        <p className="text-xs font-bold mt-0.5" style={{ color: priceColor(pct) }}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
        </p>
      </div>
    </div>
  );
};
