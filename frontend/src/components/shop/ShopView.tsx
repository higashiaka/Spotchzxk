import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Stock } from '../../hooks/useStocks';
import { subscribeStomp } from '../../lib/stompClient';
import {
  MegaphonePost,
  useMegaphonePosts,
  useMegaphoneUsesToday,
  useMegaphoneSubmit,
} from '../../hooks/useMegaphone';

/** 확성기 아이템 1회 사용 비용 (원) / Cost per megaphone use in KRW */
const MEGAPHONE_PRICE = 1_000_000_000;
/** 확성기 1일 최대 사용 횟수 / Max megaphone uses per day */
const DAILY_LIMIT = 3;

/** ISO 8601 시각 문자열을 HH:MM 형식으로 변환
 *  Converts an ISO 8601 time string to HH:MM format */
function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

/** 숫자를 한국 로케일 쉼표 형식으로 변환
 *  Formats a number with Korean locale comma separators */
function formatPrice(n: number) {
  return n.toLocaleString('ko-KR');
}

/** 확성기 사용 모달의 props 타입 / Props for the megaphone use modal */
interface MegaphoneModalProps {
  /** 스트리머 목록 (라이브 중인 종목 필터링에 사용) / Stock list used to filter live streamers */
  streamers: Stock[];
  /** 모달 닫기 핸들러 / Modal close handler */
  onClose: () => void;
  /** 확성기 게시 제출 핸들러 / Megaphone post submit handler */
  onSubmit: (channelId: string, message: string) => void;
  /** 제출 요청 진행 중 여부 / Whether a submit request is in progress */
  isPending: boolean;
}

/** 확성기 사용 모달 컴포넌트.
 *  현재 라이브 중인 종목 선택 + 선택적 메시지 입력 후 전송
 *
 *  Megaphone use modal component.
 *  Lets the user select a currently live streamer and optionally add a message */
function MegaphoneModal({ streamers, onClose, onSubmit, isPending }: MegaphoneModalProps) {
  /** 라이브 중인 종목만 필터링 / Only streamers that are currently live */
  const liveStreamers = streamers.filter(s => s.isLive);
  /** 선택된 스트리머 채널 ID / Selected streamer channel ID */
  const [selected, setSelected] = useState<string>(liveStreamers[0]?.id ?? '');
  /** 추가 메시지 입력값 / Optional message input value */
  const [message, setMessage] = useState('');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-6 w-full max-w-sm mx-4"
        style={{ background: 'var(--bg-card-secondary)', border: '1px solid #222A3A' }}
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
            {/* 라이브 종목 선택 그리드 / Live streamer selection grid */}
            <div className="grid grid-cols-2 gap-2 mb-4 max-h-48 overflow-y-auto">
              {liveStreamers.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all"
                  style={{
                    background: selected === s.id ? '#1A2A3A' : 'var(--bg-sidebar)',
                    border: `1px solid ${selected === s.id ? '#00E676' : 'var(--border-primary)'}`,
                  }}
                >
                  {s.profileImageUrl && (
                    <img src={s.profileImageUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
                  )}
                  <span className="text-xs font-bold truncate" style={{ color: selected === s.id ? '#00E676' : 'var(--text-secondary)' }}>
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
            {/* 선택적 메시지 입력 / Optional message input */}
            <input
              type="text"
              maxLength={50}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="ex) 지금 완전 재밌어요!"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-5"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid #222A3A', color: 'var(--text-secondary)' }}
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
                style={{ background: '#00E676', color: 'var(--accent-foreground)', opacity: !selected || isPending ? 0.5 : 1 }}>
                {isPending ? '처리 중...' : '사용하기 (10억)'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 상점 화면 props / Shop screen props */
interface Props {
  /** 전체 종목 목록 / Full list of stocks */
  streamers: Stock[];
  /** 로그인 사용자 (미로그인 시 null) / Authenticated user, null if not logged in */
  user: User | null;
  /** 현재 현금 잔고 / Current cash balance */
  balance: number;
}

/** 상점 화면 컴포넌트.
 *  확성기 아이템 구매·사용 및 최근 확성기 게시 목록을 표시.
 *  STOMP로 신규 게시물을 실시간 수신
 *
 *  Shop screen component.
 *  Displays the megaphone item for purchase/use and the recent megaphone post list.
 *  Receives new posts in real-time via STOMP */
export const ShopView = ({ streamers, user, balance }: Props) => {
  const { data: posts = [], refetch } = useMegaphonePosts();
  const { data: usesToday = 0 } = useMegaphoneUsesToday(user?.uid);
  const mutation = useMegaphoneSubmit(user?.uid);

  /** 모달 표시 여부 / Whether the megaphone modal is visible */
  const [showModal, setShowModal] = useState(false);
  /** REST 초기 로드 + STOMP 실시간 갱신을 합산한 게시물 목록
   *  Post list combining initial REST load and real-time STOMP updates */
  const [realtimePosts, setRealtimePosts] = useState<MegaphonePost[]>([]);

  // REST 초기 로드 결과를 실시간 목록에 동기화 / Sync initial REST data to realtime list
  useEffect(() => {
    setRealtimePosts(posts);
  }, [posts]);

  // STOMP /topic/megaphone 구독: 신규 게시물을 목록 맨 앞에 추가 (최대 20개)
  // Subscribe to STOMP /topic/megaphone: prepend new posts (max 20)
  useEffect(() => {
    const sub = subscribeStomp('/topic/megaphone', msg => {
      try {
        const post = JSON.parse(msg.body) as MegaphonePost;
        setRealtimePosts(prev => [post, ...prev].slice(0, 20));
      } catch { /* ignore parse errors */ }
    });
    return () => sub.unsubscribe();
  }, []);

  /** 잔고가 확성기 가격 이상인지 여부 / Whether balance covers the megaphone price */
  const canAfford = balance >= MEGAPHONE_PRICE;
  /** 오늘 사용 횟수가 제한 미만인지 여부 / Whether daily use count is below the limit */
  const hasUses = usesToday < DAILY_LIMIT;
  /** 게스트가 아닌 로그인 상태인지 여부 / Whether the user is logged in and not anonymous */
  const isLoggedIn = !!user && !user.isAnonymous;

  /** 모달에서 확인 시 게시 제출 + 성공 후 목록 갱신
   *  Submits the megaphone post from modal and refetches list on success */
  const handleSubmit = (channelId: string, message: string) => {
    mutation.mutate({ channelId, message }, {
      onSuccess: () => {
        setShowModal(false);
        refetch();
      },
    });
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-6 max-w-2xl mx-auto touch-pan-y">
      {showModal && (
        <MegaphoneModal
          streamers={streamers}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          isPending={mutation.isPending}
        />
      )}

      <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--text-secondary)' }}>상점</h2>

      {/* 확성기 아이템 카드 / Megaphone item card */}
      <div className="rounded-xl p-5 mb-8" style={{ background: 'var(--bg-sidebar)', border: '1px solid #222A3A' }}>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0"
            style={{ background: 'var(--bg-card)' }}>
            📣
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-bold" style={{ color: 'var(--text-secondary)' }}>확성기</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--bg-card)', color: '#00E676', border: '1px solid #00E67633' }}>
                1일 {DAILY_LIMIT}회 제한
              </span>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
              현재 상장된 라이브 스트리머의 치지직 링크를 전체에 공지합니다.
              오늘 {usesToday}/{DAILY_LIMIT}회 사용
            </p>

            <div className="flex items-center justify-between">
              {/* 가격 표시 / Price display */}
              <div>
                <span className="text-lg font-bold" style={{ color: '#FFD700' }}>
                  {formatPrice(MEGAPHONE_PRICE)}
                </span>
                <span className="text-xs ml-1" style={{ color: 'var(--text-dim)' }}>원</span>
              </div>

              {/* 구매 가능 여부에 따른 버튼/안내 / Button or info text based on purchase eligibility */}
              {!isLoggedIn ? (
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>로그인 필요</span>
              ) : !hasUses ? (
                <span className="text-xs" style={{ color: '#FF5252' }}>오늘 사용 횟수 초과</span>
              ) : !canAfford ? (
                <span className="text-xs" style={{ color: '#FF5252' }}>잔액 부족</span>
              ) : (
                <button type="button" onClick={() => setShowModal(true)}
                  className="px-4 py-2 rounded-lg text-sm font-bold transition-opacity"
                  style={{ background: '#00E676', color: 'var(--accent-foreground)' }}>
                  사용하기
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 일일 사용 횟수 인디케이터 바 / Daily usage indicator bar */}
        <div className="flex gap-2 mt-4 pt-4" style={{ borderTop: '1px solid #1A2030' }}>
          {Array.from({ length: DAILY_LIMIT }).map((_, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full"
              style={{ background: i < (DAILY_LIMIT - usesToday) ? '#00E676' : 'var(--bg-card)' }} />
          ))}
          <span className="text-xs ml-1 shrink-0" style={{ color: 'var(--text-dim)' }}>
            {DAILY_LIMIT - usesToday}회 남음
          </span>
        </div>
      </div>

      {/* 최근 확성기 게시 목록 / Recent megaphone post list */}
      <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-muted)' }}>최근 확성기</h3>
      {realtimePosts.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: 'var(--text-dim)' }}>
          아직 확성기 사용 기록이 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {realtimePosts.map(post => (
            <a key={post.id} href={post.liveUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:brightness-110"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid #222A3A', textDecoration: 'none' }}>
              <span className="text-xl shrink-0">📣</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold truncate" style={{ color: 'var(--text-secondary)' }}>
                    {post.streamerName}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: '#FF4444', color: '#FFF' }}>
                    LIVE
                  </span>
                </div>
                {post.message && (
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{post.message}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{formatTime(post.createdAt)}</p>
                <p className="text-[10px]" style={{ color: '#00AAFF' }}>링크 보기 →</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
