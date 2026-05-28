import { useState } from 'react';

/** localStorage 키: 사용자가 '다시 보지 않기'를 선택했는지 기록
 *  localStorage key used to track if the user has permanently dismissed the popup */
const NOTICE_KEY = 'notice_update_v3';

/** 앱 최초 진입 시 업데이트 사항을 안내하는 팝업 컴포넌트.
 *  localStorage에 해제 기록이 없으면 표시되고,
 *  '다시 보지 않기'를 누르면 영구적으로 숨김 처리
 *
 *  Announcement popup that informs users of update changes on first visit.
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop"
      onClick={() => dismiss(false)}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4 modal-panel"
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
          <span className="text-accent text-xl">$</span>
          <span className="font-bold text-white text-base">업데이트 안내</span>
        </div>

        {/* 변경 내용 설명 / Change description */}
        <div className="text-sm leading-relaxed text-secondary-token flex flex-col gap-3">
          {/* 배당 정책 변경 */}
          <div>
            <p className="text-white font-semibold mb-1.5">배당 정책 변경</p>
            <div className="rounded-xl p-3 text-sm modal-panel">
              <p className="mb-1">
                <span className="text-accent">변경 후</span>
                <span className="ml-2 text-white">주당 현재가의 0.7% 지급</span>
              </p>
              <p>
                <span className="text-[#FF6B6B]">기존</span>
                <span className="ml-2 text-white">발행량/유통량 기준 배당 계산</span>
              </p>
            </div>
          </div>

          {/* 닉네임 변경권 */}
          <div>
            <p className="text-white font-semibold mb-1.5">닉네임 변경권 출시</p>
            <div className="rounded-xl p-3 text-sm modal-panel">
              <p>
                <span className="text-accent">비용</span>
                <span className="ml-2 text-white">30,000,000 코인</span>
              </p>
              <p className="mt-1 text-xs text-dim-token">프로필 화면에서 이름 옆 편집 버튼으로 변경</p>
            </div>
          </div>

          {/* 종목 추가 티켓 */}
          <div>
            <p className="text-white font-semibold mb-1.5">종목 추가 티켓 출시</p>
            <div className="rounded-xl p-3 text-sm modal-panel">
              <p>
                <span className="text-accent">비용</span>
                <span className="ml-2 text-white">100,000,000 코인</span>
              </p>
              <p className="mt-1 text-xs text-dim-token">프로필 화면에서 치지직 채널 URL로 종목 추가</p>
            </div>
          </div>

          {/* 유저 랭킹 */}
          <div>
            <p className="text-white font-semibold mb-1.5">유저 랭킹 추가</p>
            <div className="rounded-xl p-3 text-sm modal-panel">
              <p>
                <span className="text-accent">기준</span>
                <span className="ml-2 text-white">누적 실현 수익 순위</span>
              </p>
              <p className="mt-1 text-xs text-dim-token">설정에서 랭킹 닉네임 공개 여부를 선택할 수 있습니다</p>
            </div>
          </div>
        </div>

        {/* 버튼 영역 / Action buttons */}
        <div className="flex flex-col gap-2 mt-1">
          {/* 확인 (이번 세션만 닫기) / Confirm (close for this session only) */}
          <button
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80 accent-button"
            onClick={() => dismiss(false)}
          >
            확인
          </button>
          {/* 영구 숨김 / Permanently dismiss */}
          <button
            className="w-full py-2.5 rounded-xl text-sm transition-colors text-dim-token border border-[#1E2330]"
            onClick={() => dismiss(true)}
          >
            다시 보지 않기
          </button>
        </div>
      </div>
    </div>
  );
}
