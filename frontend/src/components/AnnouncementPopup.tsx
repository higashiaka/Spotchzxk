import { useState } from 'react';
import { latestAnnouncement } from './announcements/announcementData';

/** localStorage 키: 사용자가 '다시 보지 않기'를 선택했는지 기록
 *  localStorage key used to track if the user has permanently dismissed the popup */
const NOTICE_KEY = latestAnnouncement.id;

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
          <span className="font-bold text-white text-base">{latestAnnouncement.title}</span>
        </div>

        {/* 변경 내용 설명 / Change description */}
        <div className="text-sm leading-relaxed text-secondary-token flex flex-col gap-3">
          {latestAnnouncement.sections.map(section => (
            <div key={section.title}>
              <p className="text-white font-semibold mb-1.5">{section.title}</p>
              <div className="rounded-xl p-3 text-sm modal-panel">
                {section.rows.map(row => (
                  <p key={`${section.title}-${row.label}`} className="mb-1 last:mb-0">
                    <span className={row.tone === 'danger' ? 'text-[#FF6B6B]' : 'text-accent'}>{row.label}</span>
                    <span className="ml-2 text-white">{row.value}</span>
                  </p>
                ))}
                {section.note && <p className="mt-1 text-xs text-dim-token">{section.note}</p>}
              </div>
            </div>
          ))}
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
