import { Stock } from '../../hooks/useStocks';
import { fmt, priceColorClass, avatarColorClass } from '../../utils';

/** Holding position card component.
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
  /** Stock data for this holding */
  streamer: Stock;
  /** Held quantity */
  qty: number;
  /** Market value (current price × quantity) */
  value: number;
  /** Return rate vs average purchase price in % */
  pct: number;
  /** Average purchase price */
  avgPrice: number;
  /** Layout variant: 'compact' for single-row list, 'detail' for card box (default: compact) */
  variant?: 'compact' | 'detail';
  /** Click handler for the card */
  onClick: () => void;
}) => {
  // Card box layout
  if (variant === 'detail') {
    return (
      <div
        className="rounded-xl border p-4 cursor-pointer surface-card-secondary border-primary-token"
        onClick={onClick}
      >
        <div className="flex justify-between items-start">
          <div>
            <p className="text-white text-sm font-bold">{streamer.name}</p>
            <p className="text-xs mt-1 text-muted-token">
              {qty}주 · 평단 {fmt(avgPrice)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-bold text-sm font-mono text-white">{fmt(streamer.price)}</p>
            <p className={`text-xs font-bold mt-1 ${priceColorClass(pct)}`}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Single-row compact layout
  return (
    <div className="flex items-center gap-3 cursor-pointer" onClick={onClick}>
      {/* Profile image or initial avatar */}
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black overflow-hidden ${avatarColorClass(streamer.name, !!streamer.profileImageUrl)}`}
      >
        {streamer.profileImageUrl ? (
          <img src={streamer.profileImageUrl} alt={streamer.name} className="w-full h-full object-cover" />
        ) : (
          streamer.name.slice(0, 2)
        )}
      </div>

      {/* Stock name and held quantity */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-bold truncate">{streamer.name}</p>
        <p className="text-xs mt-0.5 text-dim-token">{qty}주</p>
      </div>

      {/* Market value and return rate */}
      <div className="text-right shrink-0">
        <p className="font-mono font-bold text-sm text-white">{fmt(value)}</p>
        <p className={`text-xs font-bold mt-0.5 ${priceColorClass(pct)}`}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
        </p>
      </div>
    </div>
  );
};
