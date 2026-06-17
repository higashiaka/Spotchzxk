import { SuspensionNotice } from '../../hooks/useAuth';

export function SuspendedAccountModal({
  notice,
  onLogout,
}: {
  notice: SuspensionNotice;
  onLogout: () => void;
}) {
  const remainingHours = notice.suspendedUntil
    ? Math.max(0, Math.ceil((new Date(notice.suspendedUntil).getTime() - Date.now()) / 3_600_000))
    : null;
  const until = notice.suspendedUntil
    ? new Date(notice.suspendedUntil).toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '확인 중';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 modal-backdrop">
      <div className="w-full max-w-sm rounded-lg p-5 modal-panel shadow-2xl">
        <div className="mb-4">
          <p className="text-lg font-bold text-primary-token">계정 정지됨</p>
          <p className="mt-2 text-sm text-muted-token">
            정지 기간 동안 거래, 상점 이용, 프로필 변경 등 모든 계정 기능이 비활성화됩니다.
          </p>
        </div>
        <div className="rounded-lg border border-secondary-token p-3 text-sm">
          <p className="text-muted-token">정지 사유</p>
          <p className="mt-1 text-secondary-token break-words">{notice.reason}</p>
          <p className="mt-3 text-muted-token">남은 시간</p>
          <p className="mt-1 text-secondary-token">
            {remainingHours === null ? '확인 중' : `${remainingHours}시간`}
          </p>
          <p className="mt-3 text-muted-token">정지 해제 시각</p>
          <p className="mt-1 text-secondary-token">{until}</p>
        </div>
        <button
          type="button"
          className="mt-4 h-10 w-full rounded-md bg-accent text-sm font-bold"
          onClick={onLogout}
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
