import { useState, useMemo, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { changePct, priceColorClass, fmt, fmtCompact } from '../../utils';
import { OrderForm } from './OrderForm';

/** 주문 화면 컴포넌트.
 *  종목이 선택되면 OrderForm으로, 미선택이면 거래량 순 종목 목록을 표시
 *
 *  Order screen component.
 *  Shows OrderForm when a stock is selected; otherwise shows
 *  the stock list sorted by trading volume */
export const OrderView = ({
  streamers, selectedStreamer, user, initialOrderType, onSelectStreamer, onBack,
}: {
  /** 전체 종목 목록 / Full list of stocks */
  streamers: Stock[];
  /** 현재 선택된 종목 (없으면 null) / Currently selected stock, null if none */
  selectedStreamer: Stock | null;
  /** 로그인 사용자 (미로그인 시 null) / Authenticated user, null if not logged in */
  user: User | null;
  /** 주문 화면 최초 진입 시 선택할 주문 방향 / Initial order direction when entering the order screen */
  initialOrderType: 'buy' | 'sell';
  /** 종목 선택 핸들러 / Stock selection handler */
  onSelectStreamer: (s: Stock) => void;
  onBack: () => void;
}) => {
  /** 주문 수량 문자열 상태 / Order quantity as string state */
  const [qtyStr, setQtyStr] = useState('1');
  /** 주문 방향 상태 (매수/매도) / Order direction state (buy or sell) */
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  /** 이전에 선택된 종목 ID (종목 변경 시 수량 초기화 감지용)
   *  Previously selected stock ID; used to detect stock changes and reset quantity */
  const [prevId, setPrevId] = useState<string | null>(null);

  useEffect(() => {
    setOrderType(initialOrderType);
  }, [initialOrderType]);

  // 종목이 변경되면 수량을 1로 초기화 / Reset quantity to 1 when the selected stock changes
  useEffect(() => {
    if (!selectedStreamer || selectedStreamer.id === prevId) return;
    setPrevId(selectedStreamer.id);
    setQtyStr('1');
  }, [selectedStreamer, prevId]);

  const sorted = useMemo(() => [...streamers].sort((a, b) => b.totalVolume - a.totalVolume), [streamers]);

  // 종목이 선택된 경우 OrderForm 렌더링 / Render OrderForm when a stock is selected
  if (selectedStreamer) {
    return (
      <div className="h-full flex flex-col overflow-hidden surface-sidebar">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 shrink-0 text-sm font-bold transition-colors hover:opacity-70"
          style={{ color: 'var(--text-dim)', borderBottom: '1px solid #222A3A', background: 'var(--bg-sidebar)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
          이전 화면
        </button>
        <div className="flex-1 overflow-hidden">
          <OrderForm
            streamer={selectedStreamer}
            user={user}
            qtyStr={qtyStr}
            setQtyStr={setQtyStr}
            orderType={orderType}
            setOrderType={setOrderType}
          />
        </div>
      </div>
    );
  }

  /** 거래량 내림차순 정렬된 종목 목록 / Stocks sorted by volume descending */
  return (
    <div className="h-full overflow-y-auto p-4 pb-24 hide-scrollbar surface-sidebar">
      <p className="text-white font-bold text-sm mb-4">주문할 종목을 선택하세요</p>
      <div className="space-y-2">
        {sorted.map(s => {
          const pct = changePct(s.price);
          return (
            <div key={s.id} onClick={() => onSelectStreamer(s)}
              className="flex items-center px-4 py-3 rounded-xl border cursor-pointer transition-colors hover:border-[#3D8BFF] surface-card-secondary border-primary-token">
              {/* 종목명 및 거래량 / Stock name and volume */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{s.name}</p>
                <p className="text-xs mt-0.5 text-[var(--text-dim)]">{fmtCompact(s.totalVolume)}</p>
              </div>
              {/* 현재가 및 등락률 / Current price and change rate */}
              <div className="text-right ml-3 shrink-0">
                <p className={`font-mono font-bold text-sm ${priceColorClass(pct)}`}>{fmt(s.price)}</p>
                <p className={`text-xs font-bold mt-0.5 ${priceColorClass(pct)}`}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
