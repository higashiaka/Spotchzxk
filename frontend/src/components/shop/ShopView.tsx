// 상점 화면: 보유 잔고로 라이브 확성기 메시지를 구매하고 전송합니다.
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

const MEGAPHONE_PRICE = 1_000_000_000;
const DAILY_LIMIT = 3;

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatPrice(n: number) {
  return n.toLocaleString('ko-KR');
}

interface MegaphoneModalProps {
  streamers: Stock[];
  onClose: () => void;
  onSubmit: (channelId: string, message: string) => void;
  isPending: boolean;
}

function MegaphoneModal({ streamers, onClose, onSubmit, isPending }: MegaphoneModalProps) {
  const liveStreamers = streamers.filter(s => s.isLive);
  const [selected, setSelected] = useState<string>(liveStreamers[0]?.id ?? '');
  const [message, setMessage] = useState('');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-6 w-full max-w-sm mx-4"
        style={{ background: '#131924', border: '1px solid #222A3A' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-1" style={{ color: '#E8F0FE' }}>확성기 사용</h3>
        <p className="text-xs mb-5" style={{ color: '#626B7A' }}>
          라이브 중인 스트리머의 치지직 링크를 전체에 공지합니다.
        </p>

        {liveStreamers.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: '#FF5252' }}>
            현재 라이브 중인 상장 종목이 없습니다.
          </p>
        ) : (
          <>
            <label className="block text-xs font-bold mb-2" style={{ color: '#8899AA' }}>
              스트리머 선택
            </label>
            <div className="grid grid-cols-2 gap-2 mb-4 max-h-48 overflow-y-auto">
              {liveStreamers.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all"
                  style={{
                    background: selected === s.id ? '#1A2A3A' : '#0E121A',
                    border: `1px solid ${selected === s.id ? '#00E676' : '#222A3A'}`,
                  }}
                >
                  {s.profileImageUrl && (
                    <img src={s.profileImageUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
                  )}
                  <span className="text-xs font-bold truncate" style={{ color: selected === s.id ? '#00E676' : '#C0CDD8' }}>
                    {s.name}
                  </span>
                  <span className="ml-auto shrink-0 text-[9px] font-bold px-1 py-0.5 rounded"
                    style={{ background: '#FF4444', color: '#FFF' }}>
                    LIVE
                  </span>
                </button>
              ))}
            </div>

            <label className="block text-xs font-bold mb-2" style={{ color: '#8899AA' }}>
              메시지 <span style={{ color: '#626B7A' }}>(선택, 최대 50자)</span>
            </label>
            <input
              type="text"
              maxLength={50}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="ex) 지금 완전 재밌어요!"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-5"
              style={{
                background: '#0E121A',
                border: '1px solid #222A3A',
                color: '#C0CDD8',
              }}
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold"
                style={{ background: '#1A2030', color: '#626B7A' }}
              >
                취소
              </button>
              <button
                type="button"
                disabled={!selected || isPending}
                onClick={() => selected && onSubmit(selected, message)}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-opacity"
                style={{
                  background: '#00E676',
                  color: '#080A0F',
                  opacity: !selected || isPending ? 0.5 : 1,
                }}
              >
                {isPending ? '처리 중...' : '사용하기 (10억)'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface Props {
  streamers: Stock[];
  user: User | null;
  balance: number;
}

export const ShopView = ({ streamers, user, balance }: Props) => {
  const { data: posts = [], refetch } = useMegaphonePosts();
  const { data: usesToday = 0 } = useMegaphoneUsesToday(user?.uid);
  const mutation = useMegaphoneSubmit(user?.uid);

  const [showModal, setShowModal] = useState(false);
  const [realtimePosts, setRealtimePosts] = useState<MegaphonePost[]>([]);

  useEffect(() => {
    setRealtimePosts(posts);
  }, [posts]);

  useEffect(() => {
    const sub = subscribeStomp('/topic/megaphone', msg => {
      try {
        const post = JSON.parse(msg.body) as MegaphonePost;
        setRealtimePosts(prev => [post, ...prev].slice(0, 20));
      } catch { /* ignore */ }
    });
    return () => sub.unsubscribe();
  }, []);

  const canAfford = balance >= MEGAPHONE_PRICE;
  const hasUses = usesToday < DAILY_LIMIT;
  const isLoggedIn = !!user && !user.isAnonymous;

  const handleSubmit = (channelId: string, message: string) => {
    mutation.mutate({ channelId, message }, {
      onSuccess: () => {
        setShowModal(false);
        refetch();
      },
    });
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-6 max-w-2xl mx-auto">
      {showModal && (
        <MegaphoneModal
          streamers={streamers}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          isPending={mutation.isPending}
        />
      )}

      <h2 className="text-lg font-bold mb-6" style={{ color: '#E8F0FE' }}>상점</h2>

      {/* 확성기 아이템 카드 */}
      <div
        className="rounded-xl p-5 mb-8"
        style={{ background: '#0E121A', border: '1px solid #222A3A' }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0"
            style={{ background: '#1A2030' }}
          >
            📣
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-bold" style={{ color: '#E8F0FE' }}>확성기</span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: '#1A2A1A', color: '#00E676', border: '1px solid #00E67633' }}
              >
                1일 {DAILY_LIMIT}회 제한
              </span>
            </div>
            <p className="text-xs mb-3" style={{ color: '#626B7A' }}>
              현재 상장된 라이브 스트리머의 치지직 링크를 전체에 공지합니다.
              오늘 {usesToday}/{DAILY_LIMIT}회 사용
            </p>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-lg font-bold" style={{ color: '#FFD700' }}>
                  {formatPrice(MEGAPHONE_PRICE)}
                </span>
                <span className="text-xs ml-1" style={{ color: '#626B7A' }}>원</span>
              </div>

              {!isLoggedIn ? (
                <span className="text-xs" style={{ color: '#626B7A' }}>로그인 필요</span>
              ) : !hasUses ? (
                <span className="text-xs" style={{ color: '#FF5252' }}>오늘 사용 횟수 초과</span>
              ) : !canAfford ? (
                <span className="text-xs" style={{ color: '#FF5252' }}>잔액 부족</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="px-4 py-2 rounded-lg text-sm font-bold transition-opacity"
                  style={{ background: '#00E676', color: '#080A0F' }}
                >
                  사용하기
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 잔여 사용 횟수 인디케이터 */}
        <div className="flex gap-2 mt-4 pt-4" style={{ borderTop: '1px solid #1A2030' }}>
          {Array.from({ length: DAILY_LIMIT }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-1.5 rounded-full"
              style={{ background: i < (DAILY_LIMIT - usesToday) ? '#00E676' : '#1A2030' }}
            />
          ))}
          <span className="text-xs ml-1 shrink-0" style={{ color: '#626B7A' }}>
            {DAILY_LIMIT - usesToday}회 남음
          </span>
        </div>
      </div>

      {/* 최근 확성기 목록 */}
      <h3 className="text-sm font-bold mb-3" style={{ color: '#8899AA' }}>최근 확성기</h3>
      {realtimePosts.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: '#626B7A' }}>
          아직 확성기 사용 기록이 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {realtimePosts.map(post => (
            <a
              key={post.id}
              href={post.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:brightness-110"
              style={{ background: '#0E121A', border: '1px solid #222A3A', textDecoration: 'none' }}
            >
              <span className="text-xl shrink-0">📣</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold truncate" style={{ color: '#E8F0FE' }}>
                    {post.streamerName}
                  </span>
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: '#FF4444', color: '#FFF' }}
                  >
                    LIVE
                  </span>
                </div>
                {post.message && (
                  <p className="text-xs truncate" style={{ color: '#8899AA' }}>{post.message}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs" style={{ color: '#626B7A' }}>{formatTime(post.createdAt)}</p>
                <p className="text-[10px]" style={{ color: '#00AAFF' }}>링크 보기 →</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
