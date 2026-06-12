import { usePendingOrders } from '@/hooks/usePendingOrders';
import { fmtKorean, fmtShares, tradeColorClass } from '@/utils';

export const PendingOrdersPanel = ({
  userId,
  streamerId,
}: {
  userId: string | undefined;
  streamerId: string;
}) => {
  const { pendingOrders, cancelOrder, isCancelling } = usePendingOrders(userId);
  const orders = pendingOrders.filter(order => order.streamerId === streamerId);

  return (
    <div className="rounded-xl border p-3 surface-card-secondary border-primary-token">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-white text-xs font-extrabold">내 대기 주문</h3>
        <span className="text-[10px] text-[var(--text-dim)]">{orders.length}건</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-5 text-xs text-[var(--text-dim)]">
          대기 중인 주문이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(order => (
            <div key={order.id} className="rounded-lg border px-2.5 py-2 surface-card border-primary-token">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-extrabold ${tradeColorClass(order.type)}`}>
                  {order.type === 'buy' ? '매수' : '매도'}
                </span>
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => cancelOrder(order.id)}
                  className="rounded px-2 py-1 text-[10px] font-bold bg-[#B71C1C] text-white disabled:opacity-50"
                >
                  취소
                </button>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-[var(--text-muted)]">지정가</span>
                  <p className="font-mono font-bold text-white">{fmtKorean(Number(order.limitPrice ?? order.estimatedPrice))}</p>
                </div>
                <div className="text-right">
                  <span className="text-[var(--text-muted)]">수량</span>
                  <p className="font-mono font-bold text-white">{fmtShares(order.quantity)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
