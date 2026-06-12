import { GuestLimitNotice, guestLimitLabel } from '@/hooks/useAuth';

export function GuestLimitModal({
  notice,
  nowMs,
  onGoogleLogin,
}: {
  notice: GuestLimitNotice;
  nowMs: number;
  onGoogleLogin: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-lg border border-primary-token surface-card p-5 shadow-2xl">
        <div className="mb-4">
          <h2 className="text-base font-extrabold text-white">비정상적인 접근이 감지되었습니다.</h2>
          <p className="mt-3 text-sm leading-relaxed text-secondary-token">
            현재 고객님의 네트워크 및 기기 환경에서 단시간 내에 과도한 게스트 계정 생성 시도가 확인되었습니다.
            시스템 보호 및 공정한 가상 거래 환경 유지를 위해 신규 게스트 로그인이 일시적으로 제한됩니다.
          </p>
          <p className="mt-3 text-sm font-bold text-white">
            제한 해제까지 남은 시간: {guestLimitLabel(notice.retryAtMs, nowMs)}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-secondary-token">
            아래 구글 로그인을 이용하시면 대기 시간 없이 즉시 안전하게 나만의 고유 계정을 생성하고, 초기 자산과 함께 거래를 시작하실 수 있습니다.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onGoogleLogin}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:brightness-110"
          >
            구글 계정으로 즉시 시작하기
          </button>
        </div>
      </div>
    </div>
  );
}
