import { useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import { Stock } from '../../hooks/useStocks';
import { apiFetch } from '../../lib/api';
import {
  useMegaphoneUsesToday,
  useMegaphoneSubmit,
} from '../../hooks/useMegaphone';

/** Cost per megaphone use in KRW */
const MEGAPHONE_PRICE = 30_000_000;
const NICKNAME_TICKET_PRICE = 1_000_000;
const STOCK_ADD_TICKET_PRICE = 10_000_000;
/** Max megaphone uses per day */
const DAILY_LIMIT = 5;

/** Formats a number with Korean locale comma separators */
function formatPrice(n: number) {
  return n.toLocaleString('ko-KR');
}

function ShopItemCard({
  title,
  description,
  owned,
  price,
  disabled,
  pending,
  onPurchase,
}: {
  title: string;
  description: string;
  owned: number;
  price: number;
  disabled: boolean;
  pending: boolean;
  onPurchase: () => void;
}) {
  return (
    <div className="rounded-xl p-4 md:p-6" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-primary)' }}>
      <div className="flex items-start justify-between gap-3 mb-3 md:mb-5">
        <div className="min-w-0">
          <p className="text-sm md:text-lg font-bold text-white">{title}</p>
          <p className="text-xs md:text-sm mt-1 md:mt-2 leading-relaxed" style={{ color: 'var(--text-dim)' }}>
            {description}
          </p>
        </div>
        <span
          className="shrink-0 text-xs md:text-sm font-bold px-2 md:px-3 py-1 rounded-full"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          {owned}개
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-base md:text-xl font-bold" style={{ color: '#D4A017' }}>
            {formatPrice(price)}
          </span>
          <span className="text-xs md:text-sm ml-1" style={{ color: 'var(--text-dim)' }}>원</span>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onPurchase}
          className="px-3 py-2 md:px-5 md:py-3 rounded-lg text-xs md:text-sm font-bold transition-opacity disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
        >
          {pending ? '구매 중...' : '구매'}
        </button>
      </div>
    </div>
  );
}

/** Props for the megaphone use modal */
interface MegaphoneModalProps {
  /** Stock list used to filter live streamers */
  streamers: Stock[];
  /** Modal close handler */
  onClose: () => void;
  /** Megaphone post submit handler */
  onSubmit: (channelId: string, message: string) => void;
  /** Whether a submit request is in progress */
  isPending: boolean;
}

/** Megaphone use modal component.
 *  Lets the user select a currently live streamer and optionally add a message */
function MegaphoneModal({ streamers, onClose, onSubmit, isPending }: MegaphoneModalProps) {
  /** Only streamers that are currently live */
  const liveStreamers = streamers.filter(s => s.isLive);
  /** Selected streamer channel ID */
  const [selected, setSelected] = useState<string>(liveStreamers[0]?.id ?? '');
  /** Optional message input value */
  const [message, setMessage] = useState('');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-6 w-full max-w-sm mx-4"
        style={{ background: 'var(--bg-card-secondary)', border: '1px solid var(--border-primary)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>확성기 사용</h3>
        <p className="text-xs mb-5" style={{ color: 'var(--text-dim)' }}>
          라이브 중인 스트리머의 치지직 링크를 전체에 공지합니다.
        </p>

        {liveStreamers.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: '#FF5252' }}>
            현재 라이브 중인 상장 종목이 없습니다.
          </p>
        ) : (
          <>
            <label className="block text-xs font-bold mb-2" style={{ color: 'var(--text-muted)' }}>
              스트리머 선택
            </label>
            {/* Live streamer selection grid */}
            <div className="grid grid-cols-2 gap-2 mb-4 max-h-48 overflow-y-auto hide-scrollbar">
              {liveStreamers.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all"
                  style={{
                    background: selected === s.id ? 'var(--accent-soft)' : 'var(--bg-sidebar)',
                    border: `1px solid ${selected === s.id ? 'var(--accent)' : 'var(--border-primary)'}`,
                  }}
                >
                  {s.profileImageUrl && (
                    <img src={s.profileImageUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
                  )}
                  <span className="text-xs font-bold truncate" style={{ color: selected === s.id ? 'var(--accent)' : 'var(--text-secondary)' }}>
                    {s.name}
                  </span>
                  <span className="ml-auto shrink-0 text-[9px] font-bold px-1 py-0.5 rounded"
                    style={{ background: '#FF4444', color: '#FFF' }}>
                    LIVE
                  </span>
                </button>
              ))}
            </div>

            <label className="block text-xs font-bold mb-2" style={{ color: 'var(--text-muted)' }}>
              메시지 <span style={{ color: 'var(--text-dim)' }}>(선택, 최대 50자)</span>
            </label>
            {/* Optional message input */}
            <input
              type="text"
              maxLength={50}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="ex) 지금 완전 재밌어요!"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-5"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
            />

            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold"
                style={{ background: 'var(--bg-card)', color: 'var(--text-dim)' }}>
                취소
              </button>
              <button
                type="button"
                disabled={!selected || isPending}
                onClick={() => selected && onSubmit(selected, message)}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-opacity"
                style={{ background: 'var(--accent)', color: 'var(--accent-foreground)', opacity: !selected || isPending ? 0.5 : 1 }}>
                {isPending ? '처리 중...' : `사용하기 (${formatPrice(MEGAPHONE_PRICE)}원)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DonationCard({ balance, userId, isLoggedIn }: { balance: number; userId: string | undefined; isLoggedIn: boolean }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const parsedAmount = parseInt(amount.replace(/,/g, '') || '0', 10);
  const isValid = parsedAmount >= 1_000 && parsedAmount <= balance;

  const presets = [10_000, 100_000, 1_000_000, 10_000_000];

  function handleAmountChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, '');
    const num = parseInt(digits || '0', 10);
    setAmount(num > 0 ? num.toLocaleString('ko-KR') : '');
    setError('');
    setSuccessMsg('');
  }

  async function handleDonate() {
    if (!isValid || pending) return;
    setPending(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await apiFetch('/api/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parsedAmount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '후원에 실패했습니다.');
        return;
      }
      queryClient.setQueryData(['portfolio', userId], (old: any) =>
        old ? { ...old, balance: data.balance, donationTotal: data.donationTotal } : old
      );
      queryClient.invalidateQueries({ queryKey: ['rankings', 'donation'] });
      setAmount('');
      setSuccessMsg(`${parsedAmount.toLocaleString('ko-KR')}원 후원 완료!`);
      inputRef.current?.blur();
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl p-5 md:p-7 mb-8 md:mb-10" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-primary)' }}>
      <div className="flex items-start gap-4 md:gap-6 mb-4 md:mb-6">
        <div className="w-14 h-14 md:w-20 md:h-20 rounded-xl flex items-center justify-center text-3xl md:text-5xl shrink-0"
          style={{ background: 'var(--bg-card)' }}>
          🎁
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base md:text-2xl font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>후원하기</p>
          <p className="text-xs md:text-sm" style={{ color: 'var(--text-dim)' }}>
            잔고에서 금액을 차감해 후원왕 랭킹에 반영합니다. 매일 자정에 초기화됩니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            disabled={!isLoggedIn}
            onClick={() => { setAmount(p.toLocaleString('ko-KR')); setError(''); setSuccessMsg(''); }}
            className="h-9 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
            style={{
              background: parsedAmount === p ? 'var(--accent)' : 'var(--bg-card)',
              color: parsedAmount === p ? 'var(--accent-foreground)' : 'var(--text-muted)',
              border: '1px solid var(--border-primary)',
            }}
          >
            {p >= 1_000_000 ? `${p / 1_000_000}백만` : `${p / 10_000}만`}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div
          className="flex items-center flex-1 min-w-0 rounded-xl px-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', height: '48px' }}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            placeholder={isLoggedIn ? '금액 입력 (최소 1,000원)' : '로그인 필요'}
            disabled={!isLoggedIn}
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleDonate(); }}
            className="flex-1 bg-transparent text-sm font-bold outline-none disabled:opacity-40"
            style={{ color: 'var(--text-secondary)' }}
          />
          <span className="text-xs ml-2 shrink-0" style={{ color: 'var(--text-dim)' }}>원</span>
        </div>
        <button
          type="button"
          disabled={!isValid || pending}
          onClick={handleDonate}
          className="px-5 shrink-0 rounded-xl text-sm font-bold transition-opacity disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--accent-foreground)', height: '48px' }}
        >
          {pending ? '...' : '후원'}
        </button>
      </div>

      {error && (
        <p className="text-xs mt-2 font-bold" style={{ color: '#FF5252' }}>{error}</p>
      )}
      {successMsg && (
        <p className="text-xs mt-2 font-bold" style={{ color: 'var(--accent)' }}>{successMsg}</p>
      )}
    </div>
  );
}

/** Shop screen props */
interface Props {
  /** Full list of stocks */
  streamers: Stock[];
  /** Authenticated user, null if not logged in */
  user: User | null;
  /** Current cash balance */
  balance: number;
  /** Current portfolio data */
  portfolio: any;
}

/** Shop screen component.
 *  Displays the megaphone item for purchase/use. */
export const ShopView = ({ streamers, user, balance, portfolio }: Props) => {
  const queryClient = useQueryClient();
  const { data: usesToday = 0 } = useMegaphoneUsesToday(user?.uid);
  const mutation = useMegaphoneSubmit(user?.uid);

  /** Whether the megaphone modal is visible */
  const [showModal, setShowModal] = useState(false);
  const [purchasePending, setPurchasePending] = useState<string | null>(null);

  /** Whether balance covers the megaphone price */
  const canAfford = balance >= MEGAPHONE_PRICE;
  /** Whether daily use count is below the limit */
  const hasUses = usesToday < DAILY_LIMIT;
  /** Whether the user is logged in and not anonymous */
  const isLoggedIn = !!user && !user.isAnonymous;
  const nicknameTickets = Number(portfolio?.nicknameChangeTickets ?? 0);
  const stockAddTickets = Number(portfolio?.stockAddTickets ?? 0);

  /** Submits the megaphone post from modal and closes it on success */
  const handleSubmit = (channelId: string, message: string) => {
    mutation.mutate({ channelId, message }, {
      onSuccess: () => {
        setShowModal(false);
      },
    });
  };

  const purchaseItem = async (item: 'nickname-change-ticket' | 'stock-add-ticket') => {
    if (!user || purchasePending) return;
    setPurchasePending(item);
    try {
      const res = await apiFetch('/api/shop/items/purchase', {
        method: 'POST',
        body: JSON.stringify({ item }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '구매에 실패했습니다.');
        return;
      }
      queryClient.setQueryData(['portfolio', user.uid], (old: any) => (
        old ? { ...old, ...json } : old
      ));
      queryClient.invalidateQueries({ queryKey: ['portfolio', user.uid] });
    } catch {
      alert('구매에 실패했습니다.');
    } finally {
      setPurchasePending(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto touch-pan-y">
      {showModal && (
        <MegaphoneModal
          streamers={streamers}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          isPending={mutation.isPending}
        />
      )}

      <h2 className="text-lg md:text-3xl font-black mb-6 md:mb-8" style={{ color: 'var(--text-secondary)' }}>상점</h2>

      <div className="grid gap-3 md:gap-5 mb-4 md:mb-6 sm:grid-cols-2">
        <ShopItemCard
          title="닉네임 변경권"
          description="프로필 닉네임을 변경할 때 1개가 차감됩니다."
          owned={nicknameTickets}
          price={NICKNAME_TICKET_PRICE}
          disabled={!isLoggedIn || balance < NICKNAME_TICKET_PRICE || purchasePending !== null}
          pending={purchasePending === 'nickname-change-ticket'}
          onPurchase={() => purchaseItem('nickname-change-ticket')}
        />
        <ShopItemCard
          title="종목 추가 티켓"
          description="새 치지직 채널을 종목으로 등록할 때 1개가 차감됩니다."
          owned={stockAddTickets}
          price={STOCK_ADD_TICKET_PRICE}
          disabled={!isLoggedIn || balance < STOCK_ADD_TICKET_PRICE || purchasePending !== null}
          pending={purchasePending === 'stock-add-ticket'}
          onPurchase={() => purchaseItem('stock-add-ticket')}
        />
      </div>

      {/* Megaphone item card */}
      <div className="rounded-xl p-5 md:p-7 mb-8 md:mb-10" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-primary)' }}>
        <div className="flex items-start gap-4 md:gap-6">
          <div className="w-14 h-14 md:w-20 md:h-20 rounded-xl flex items-center justify-center text-3xl md:text-5xl shrink-0"
            style={{ background: 'var(--bg-card)' }}>
            📣
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 md:gap-3 mb-1">
              <span className="text-base md:text-2xl font-bold" style={{ color: 'var(--text-secondary)' }}>확성기</span>
              <span className="text-[10px] md:text-xs font-bold px-2 md:px-3 py-0.5 md:py-1 rounded-full"
                style={{ background: 'var(--bg-card)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
                1일 {DAILY_LIMIT}회 제한
              </span>
            </div>
            <p className="text-xs md:text-sm mb-3 md:mb-5" style={{ color: 'var(--text-dim)' }}>
              현재 상장된 라이브 스트리머의 치지직 링크를 전체에 공지합니다.
              오늘 {usesToday}/{DAILY_LIMIT}회 사용
            </p>

            <div className="flex items-center justify-between">
              {/* Price display */}
              <div>
                <span className="text-lg md:text-2xl font-bold" style={{ color: '#D4A017' }}>
                  {formatPrice(MEGAPHONE_PRICE)}
                </span>
                <span className="text-xs md:text-sm ml-1" style={{ color: 'var(--text-dim)' }}>원</span>
              </div>

              {/* Button or info text based on purchase eligibility */}
              {!isLoggedIn ? (
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>로그인 필요</span>
              ) : !hasUses ? (
                <span className="text-xs" style={{ color: '#FF5252' }}>오늘 사용 횟수 초과</span>
              ) : !canAfford ? (
                <span className="text-xs" style={{ color: '#FF5252' }}>잔액 부족</span>
              ) : (
                <button type="button" onClick={() => setShowModal(true)}
                  className="px-4 py-2 md:px-6 md:py-3 rounded-lg text-sm md:text-base font-bold transition-opacity"
                  style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>
                  사용하기
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Daily usage indicator bar */}
        <div className="flex gap-2 mt-4 md:mt-6 pt-4 md:pt-5" style={{ borderTop: '1px solid var(--border-card)' }}>
          {Array.from({ length: DAILY_LIMIT }).map((_, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full"
              style={{ background: i < (DAILY_LIMIT - usesToday) ? 'var(--accent)' : 'var(--bg-card)' }} />
          ))}
          <span className="text-xs ml-1 shrink-0" style={{ color: 'var(--text-dim)' }}>
            {DAILY_LIMIT - usesToday}회 남음
          </span>
        </div>
      </div>

      <DonationCard balance={balance} userId={user?.uid} isLoggedIn={isLoggedIn} />
    </div>
  );
};
