import { useState } from 'react';
import { createPortal } from 'react-dom';
import { User } from 'firebase/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stock } from '../../hooks/useStocks';
import { apiFetch } from '../../lib/api';
import {
  useMegaphoneUsesToday,
  useMegaphoneSubmit,
} from '../../hooks/useMegaphone';
import { LegalFooter } from '../legal/LegalFooter';

/** Cost per megaphone use in KRW */
const MEGAPHONE_PRICE = 30_000_000;
const NICKNAME_TICKET_PRICE = 1_000_000;
const STOCK_ADD_TICKET_PRICE = 10_000_000;
/** Max megaphone uses per day */
const DAILY_LIMIT = 5;

type AttendanceReward = {
  rewardType: 'cash' | 'item';
  rewardAmount: string | number;
  itemType: string;
  itemName: string;
  itemQuantity: number;
};

type AttendanceStatus = AttendanceReward & {
  claimed: boolean;
  claimedToday: boolean;
  streakDay: number;
  balance: string | number;
  nicknameChangeTickets: number;
  stockAddTickets: number;
  megaphoneTickets: number;
  nextMilestoneDay: number;
  nextMilestoneReward: AttendanceReward;
};

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

function rewardLabel(reward: Pick<AttendanceReward, 'rewardType' | 'rewardAmount' | 'itemName' | 'itemQuantity'>) {
  if (reward.rewardType === 'item') {
    return `${reward.itemName} x${reward.itemQuantity}`;
  }
  return `${formatPrice(Number(reward.rewardAmount ?? 0))} cash`;
}

function useAttendance(userId: string | undefined) {
  return useQuery({
    queryKey: ['attendance', userId],
    queryFn: async (): Promise<AttendanceStatus> => {
      const res = await apiFetch('/api/shop/attendance');
      if (!res.ok) throw new Error('Failed to load daily reward.');
      return res.json();
    },
    enabled: !!userId,
  });
}

function AttendanceRewardCard({ user }: { user: User | null }) {
  const queryClient = useQueryClient();
  const { data } = useAttendance(user?.uid);
  const mutation = useMutation({
    mutationFn: async (): Promise<AttendanceStatus> => {
      const res = await apiFetch('/api/shop/attendance/claim', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to claim daily reward.');
      return json;
    },
    onSuccess: (json) => {
      if (!user?.uid) return;
      queryClient.setQueryData(['attendance', user.uid], json);
      queryClient.setQueryData(['portfolio', user.uid], (old: any) => (
        old ? {
          ...old,
          balance: String(json.balance),
          nicknameChangeTickets: json.nicknameChangeTickets,
          stockAddTickets: json.stockAddTickets,
          megaphoneTickets: json.megaphoneTickets,
        } : old
      ));
      queryClient.invalidateQueries({ queryKey: ['portfolio', user.uid] });
    },
    onError: (err) => alert(err instanceof Error ? err.message : 'Failed to claim daily reward.'),
  });

  const isLoggedIn = !!user && !user.isAnonymous;
  const todayReward = data ? rewardLabel(data) : 'Sign in to preview';
  const milestone = data?.nextMilestoneReward ? rewardLabel(data.nextMilestoneReward) : '';

  return (
    <div className="rounded-xl p-5 md:p-6 mb-4 md:mb-6" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-primary)' }}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-base md:text-xl font-black" style={{ color: 'var(--text-secondary)' }}>Daily Streak Reward</p>
          <p className="text-xs md:text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
            Day {data?.streakDay ?? 0} streak · Today: {todayReward}
          </p>
          {milestone && (
            <p className="text-xs mt-2" style={{ color: 'var(--accent)' }}>
              Next milestone: Day {data?.nextMilestoneDay} · {milestone}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={!isLoggedIn || data?.claimedToday || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="px-4 py-2.5 md:px-5 md:py-3 rounded-lg text-sm font-bold transition-opacity disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
        >
          {!isLoggedIn ? 'Sign in' : data?.claimedToday ? 'Claimed today' : mutation.isPending ? 'Claiming...' : 'Claim reward'}
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 mt-4">
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full"
            style={{ background: i < (data?.streakDay ?? 0) % 14 ? 'var(--accent)' : 'var(--bg-card)' }}
          />
        ))}
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

  return createPortal(
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
  const [showInventory, setShowInventory] = useState(false);
  const [purchasePending, setPurchasePending] = useState<string | null>(null);

  /** Whether balance covers the megaphone price */
  const nicknameTickets = Number(portfolio?.nicknameChangeTickets ?? 0);
  const stockAddTickets = Number(portfolio?.stockAddTickets ?? 0);
  const megaphoneTickets = Number(portfolio?.megaphoneTickets ?? 0);
  const canAfford = balance >= MEGAPHONE_PRICE || megaphoneTickets > 0;
  const usedToday = Math.min(Math.max(usesToday, 0), DAILY_LIMIT);
  const remainingUses = DAILY_LIMIT - usedToday;
  /** Whether daily use count is below the limit */
  const hasUses = usedToday < DAILY_LIMIT;
  /** Whether the user is logged in and not anonymous */
  const isLoggedIn = !!user && !user.isAnonymous;

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
    <div className="relative h-full overflow-y-auto px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto touch-pan-y">
      {showModal && (
        <MegaphoneModal
          streamers={streamers}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          isPending={mutation.isPending}
        />
      )}
      {showInventory && (
        <InventoryModal portfolio={portfolio} onClose={() => setShowInventory(false)} />
      )}

      <div className="flex items-center justify-between gap-3 mb-6 md:mb-8">
        <h2 className="text-lg md:text-3xl font-black" style={{ color: 'var(--text-secondary)' }}>상점</h2>
        <button type="button" onClick={() => setShowInventory(true)}
          className="rounded-lg border px-3 py-2 text-xs md:text-sm font-bold shrink-0"
          style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
          보유 아이템
        </button>
      </div>

      <AttendanceRewardCard user={user} />

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
              오늘 {usedToday}/{DAILY_LIMIT}회 사용 · Tickets: {megaphoneTickets}
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
              style={{ background: i < usedToday ? 'var(--accent)' : 'var(--bg-card)' }} />
          ))}
          <span className="text-xs ml-1 shrink-0" style={{ color: 'var(--text-dim)' }}>
            {remainingUses}회 남음
          </span>
        </div>
      </div>
      <LegalFooter />
    </div>
  );
};

function InventoryModal({ portfolio, onClose }: { portfolio: any; onClose: () => void }) {
  const items = Array.isArray(portfolio?.items) ? portfolio.items : [];
  const titles = Array.isArray(portfolio?.titles) ? portfolio.titles : [];
  const selectedTitleId = portfolio?.selectedTitleId ? String(portfolio.selectedTitleId) : '';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[82vh] overflow-y-auto hide-scrollbar rounded-xl border"
        style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <div>
            <h3 className="text-white text-base font-black">보유 아이템</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>아이템과 획득한 칭호</p>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-bold"
            style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
            닫기
          </button>
        </div>

        <div className="p-4">
          <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>아이템</p>
          {items.length === 0 ? (
            <EmptyInventoryText text="보유한 아이템이 없습니다." />
          ) : (
            <div className="space-y-2">
              {items.map((item: any) => (
                <div key={item.type} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{item.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{item.type}</p>
                  </div>
                  <span className="text-sm font-black font-mono" style={{ color: 'var(--accent)' }}>
                    {Number(item.quantity).toLocaleString('ko-KR')}개
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs font-bold mt-5 mb-2" style={{ color: 'var(--text-secondary)' }}>칭호</p>
          {titles.length === 0 ? (
            <EmptyInventoryText text="획득한 칭호가 없습니다." />
          ) : (
            <div className="space-y-2">
              {titles.map((title: any) => (
                <div key={title.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{title.label}</p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-dim)' }}>{title.description}</p>
                  </div>
                  {selectedTitleId === String(title.id) && (
                    <span className="text-xs font-bold px-2 py-1 rounded-md shrink-0"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                      표시 중
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EmptyInventoryText({ text }: { text: string }) {
  return (
    <div className="rounded-lg border px-3 py-4 text-center text-xs"
      style={{ borderColor: 'var(--border-primary)', color: 'var(--text-dim)' }}>
      {text}
    </div>
  );
}
