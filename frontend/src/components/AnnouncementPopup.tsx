import { useState } from 'react';

/** localStorage 키: 사용자가 '다시 보지 않기'를 선택했는지 기록
 *  localStorage key used to track if the user has permanently dismissed the popup */
const NOTICE_KEY = 'notice_dividend_price5_v1';

/** 앱 최초 진입 시 배당 정책 변경 사항을 안내하는 팝업 컴포넌트.
 *  localStorage에 해제 기록이 없으면 표시되고,
 *  '다시 보지 않기'를 누르면 영구적으로 숨김 처리
 *
 *  Announcement popup that informs users of dividend policy changes on first visit.
 *  Shown unless already dismissed in localStorage;
 *  permanently hidden when the user clicks "Don't show again" */
export default function AnnouncementPopup() {
  const [visible, setVisible] = useState(() => localStorage.getItem(NOTICE_KEY) !== 'hidden');

  if (!visible) return null;

  /** 팝업 닫기 함수.
   *  permanent=true면 localStorage에 기록해 재방문 시에도 표시하지 않음
   *
   *  Closes the popup.
   *  If permanent=true, writes to localStorage so it stays hidden on future visits */
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
        style={{ background: 'var(--bg-card-secondary)', border: '1px solid #1E2330' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 닫기 버튼 (이번 세션만) / Close button (this session only) */}
        <button
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
          onClick={() => dismiss(false)}
        >
          X
        </button>

        {/* 공지 제목 / Announcement title */}
        <div className="flex items-center gap-2">
          <span style={{ color: '#00E676', fontSize: 20 }}>$</span>
          <span className="font-bold text-white text-base">배당 정책 변경 안내</span>
        </div>

        {/* 변경 내용 설명 / Change description */}
        <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <p className="mb-3">
            배당 지급 기준이 발행량과 무관하게 단순화됩니다.
          </p>
          <div
            className="rounded-xl p-3 mb-3 text-sm"
            style={{ background: 'var(--bg-card-secondary)', border: '1px solid #1E2330' }}
          >
            <p className="mb-1">
              <span style={{ color: '#00E676' }}>변경 후</span>
              <span className="ml-2 text-white">주당 현재가의 5% 지급</span>
            </p>
            <p>
              <span style={{ color: '#FF6B6B' }}>기존</span>
              <span className="ml-2 text-white">발행량/유통량 기준 배당 계산</span>
            </p>
          </div>
          <p>
            보유 수량에 따라 <span className="text-white font-medium">현재가의 5% x 보유 주식 수</span>만큼 배당이 지급됩니다.
          </p>
        </div>

        {/* 버튼 영역 / Action buttons */}
        <div className="flex flex-col gap-2 mt-1">
          {/* 확인 (이번 세션만 닫기) / Confirm (close for this session only) */}
          <button
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80"
            style={{ background: '#00E676', color: 'var(--accent-foreground)' }}
            onClick={() => dismiss(false)}
          >
            확인
          </button>
          {/* 영구 숨김 / Permanently dismiss */}
          <button
            className="w-full py-2.5 rounded-xl text-sm transition-colors"
            style={{ color: 'var(--text-dim)', border: '1px solid #1E2330' }}
            onClick={() => dismiss(true)}
          >
            다시 보지 않기
          </button>
        </div>
      </div>
    </div>
  );
}
