import { useState } from 'react';

const NOTICE_KEY = 'notice_dividend_prestream_v1';

export default function AnnouncementPopup() {
  const [visible, setVisible] = useState(() => localStorage.getItem(NOTICE_KEY) !== 'hidden');

  if (!visible) return null;

  const dismiss = (permanent: boolean) => {
    if (permanent) localStorage.setItem(NOTICE_KEY, 'hidden');
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={() => dismiss(false)}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
        style={{ background: '#12151C', border: '1px solid #1E2330' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 닫기 */}
        <button
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
          onClick={() => dismiss(false)}
        >
          ✕
        </button>

        {/* 헤더 */}
        <div className="flex items-center gap-2">
          <span style={{ color: '#00E676', fontSize: 20 }}>📢</span>
          <span className="font-bold text-white text-base">배당 정책 변경 안내</span>
        </div>

        {/* 본문 */}
        <div className="text-sm leading-relaxed" style={{ color: '#B0B8C8' }}>
          <p className="mb-3">
            배당 스나이핑 방지를 위해 배당 지급 기준이 변경됩니다.
          </p>
          <div
            className="rounded-xl p-3 mb-3 text-sm"
            style={{ background: '#0D1017', border: '1px solid #1E2330' }}
          >
            <p className="mb-1">
              <span style={{ color: '#00E676' }}>변경 전</span>
              <span className="ml-2 text-white">방송 중 매수분도 즉시 배당 대상</span>
            </p>
            <p>
              <span style={{ color: '#FF6B6B' }}>변경 후</span>
              <span className="ml-2 text-white">방송 시작 전 보유분에만 배당 지급</span>
            </p>
          </div>
          <p>
            방송 중 매수한 주식은 <span className="text-white font-medium">다음 방송 시작 시</span>부터 배당 대상에 포함됩니다.
          </p>
        </div>

        {/* 버튼 */}
        <div className="flex flex-col gap-2 mt-1">
          <button
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80"
            style={{ background: '#00E676', color: '#080A0F' }}
            onClick={() => dismiss(false)}
          >
            확인
          </button>
          <button
            className="w-full py-2.5 rounded-xl text-sm transition-colors"
            style={{ color: '#5A6478', border: '1px solid #1E2330' }}
            onClick={() => dismiss(true)}
          >
            다시 보지 않기
          </button>
        </div>
      </div>
    </div>
  );
}
