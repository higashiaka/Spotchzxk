import { useMemo } from 'react';
import { useOrderBook } from '@/hooks/useOrderBook';
import { fmt } from '@/utils';

export const OrderBookPanel = ({ streamerId }: { streamerId: string }) => {
  const { data } = useOrderBook(streamerId);
  const asks = data?.asks ?? [];
  const bids = data?.bids ?? [];
  const maxQty = useMemo(
    () => Math.max(1, ...asks.map(level => level.quantity), ...bids.map(level => level.quantity)),
    [asks, bids],
  );

  const rows = [
    ...asks.slice().reverse().map(level => ({ ...level, type: 'ask' as const })),
    { price: data?.currentPrice ?? 0, quantity: 0, type: 'current' as const },
    ...bids.map(level => ({ ...level, type: 'bid' as const })),
  ];

  return (
    <div className="rounded-xl border p-3 surface-card-secondary border-primary-token">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-white text-xs font-extrabold">호가창</h3>
        <span className="text-[10px] text-[var(--text-dim)]">지정가 대기</span>
      </div>
      <div className="grid grid-cols-[1fr_1fr] text-[10px] font-bold mb-1 text-[var(--text-muted)]">
        <span>가격</span>
        <span className="text-right">수량</span>
      </div>
      <div className="space-y-1">
        {rows.length === 1 ? (
          <div className="text-center py-5 text-xs text-[var(--text-dim)]">
            대기 중인 지정가 주문이 없습니다.
          </div>
        ) : rows.map((row, index) => {
          if (row.type === 'current') {
            return (
              <div key="current" className="py-1.5 my-1 border-y border-primary-token text-center">
                <span className="font-mono text-sm font-black text-white">{fmt(row.price)}</span>
              </div>
            );
          }

          const isAsk = row.type === 'ask';
          const pct = Math.max(6, Math.min(100, (row.quantity / maxQty) * 100));
          return (
            <div key={`${row.type}-${row.price}-${index}`} className="relative grid grid-cols-[1fr_1fr] items-center overflow-hidden rounded px-2 py-1.5 text-xs">
              <div
                className="absolute inset-y-0 right-0 opacity-20"
                style={{
                  width: `${pct}%`,
                  backgroundColor: isAsk ? '#3D8BFF' : '#FF5252',
                }}
              />
              <span className="relative font-mono font-bold" style={{ color: isAsk ? '#3D8BFF' : '#FF5252' }}>
                {fmt(row.price)}
              </span>
              <span className="relative text-right font-mono text-white">
                {row.quantity.toLocaleString('ko-KR')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
