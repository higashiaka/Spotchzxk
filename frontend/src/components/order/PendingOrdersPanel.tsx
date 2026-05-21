import { usePendingOrders } from '../../hooks/usePendingOrders';
import { fmt } from '../../utils';

interface PendingOrdersPanelProps {
  userId: string;
  streamerId: string;
}

export const PendingOrdersPanel = ({ userId, streamerId }: PendingOrdersPanelProps) => {
  const { pendingOrders, isLoading, cancelOrder, isCancelling } = usePendingOrders(userId);

  const streamerPending = pendingOrders.filter(o => o.streamerId === streamerId);

  if (isLoading || streamerPending.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-[#222A3A]">
      <p className="text-[10px] font-bold mb-2 text-[#8491A5]">
        미체결 주문 ({streamerPending.length})
      </p>
      <div className="space-y-2">
        {streamerPending.map((order) => (
          <div
            key={order.id}
            className="flex items-center justify-between rounded-xl border px-3 py-2 bg-[#131924] border-[#222A3A]"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-[10px] font-extrabold shrink-0 px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: order.type === 'buy' ? '#FF525220' : '#3D8BFF20',
                  color: order.type === 'buy' ? '#FF5252' : '#3D8BFF',
                }}
              >
                {order.type === 'buy' ? '매수' : '매도'}
              </span>
              <span className="font-mono text-xs text-white">
                {order.quantity}주
              </span>
              <span className="text-[10px] text-[#626B7A]">@</span>
              <span className="font-mono text-xs font-bold text-white">
                {fmt(order.limitPrice ?? order.estimatedPrice)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => cancelOrder(order.id)}
              disabled={isCancelling}
              className="shrink-0 ml-2 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: '#1A2232', color: '#8491A5' }}
            >
              취소
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
