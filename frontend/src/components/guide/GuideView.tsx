import { LegalFooter } from '../legal/LegalFooter';

export const GuideView = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-24 hide-scrollbar touch-pan-y">
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={onBack}
          className="md:hidden w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors hover:opacity-80 active:opacity-60"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
          aria-label="뒤로 가기"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0">
          <h2 className="text-xl md:text-2xl font-black text-white">가이드</h2>
          <p className="text-xs md:text-sm mt-0.5" style={{ color: 'var(--text-dim)' }}>
            Spotchzxk가 돌아가는 방식과 기본 사용법
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 max-w-5xl">
        <GuideSection
          title="기본 흐름"
          items={[
            '스트리머를 하나의 종목처럼 보고, 현재가를 기준으로 매수와 매도를 합니다.',
            '처음 시작하면 투자금 1,000만원으로 거래를 시작합니다.',
            '홈에서는 내 자산, 최근 체결, 최근 본 종목, 거래량 상위 종목을 빠르게 확인합니다.',
          ]}
        />
        <GuideSection
          title="가격이 움직이는 방식"
          items={[
            '매수 주문이 체결되면 가격이 올라가고, 매도 주문이 체결되면 가격이 내려갑니다.',
            '가격 영향은 주문 수량에 따라 커집니다. 1주마다 약 0.05%씩 현재가에 복리로 반영됩니다.',
            '체결된 가격이 곧 새로운 현재가가 되며, 체결 수량은 당일 거래량에 누적됩니다.',
            '시세 화면의 캔들 차트는 체결 데이터를 시간 단위로 묶어 시가, 고가, 저가, 종가를 보여줍니다.',
            '등락률은 오늘 기준가 대비 현재가가 얼마나 변했는지로 계산되고, 기준가는 일일 초기화 때 직전 현재가로 갱신됩니다.',
          ]}
        />
        <GuideSection
          title="주문 사용법"
          items={[
            '시세에서 종목을 선택한 뒤 빠른 주문 또는 주문 화면에서 매수와 매도를 실행합니다.',
            '시장가 주문은 현재가를 기준으로 예상 금액을 계산하고, 서버 체결 후 잔고와 보유 수량이 갱신됩니다.',
            '매수는 현금 잔고 안에서만 가능하고, 매도는 보유 수량 안에서만 가능합니다.',
          ]}
        />
        <GuideSection
          title="차트와 랭킹"
          items={[
            '차트 탭에서는 거래량, 거래대금, 급상승, 급하락, 신규상장, 배당 기준으로 종목을 정렬합니다.',
            '거래대금은 당일 모든 체결의 체결가×수량을 누적한 값이며, 큰 금액은 억/만 단위로 줄여 표시합니다.',
            '랭킹 탭에서는 사용자별 자산 순위를 확인하고, 설정에서 닉네임 공개 여부를 바꿀 수 있습니다.',
          ]}
        />
        <GuideSection
          title="배당"
          items={[
            '라이브 중인 종목은 일정 주기마다 배당 대상이 됩니다.',
            '배당 예상치는 현재가 기준으로 계산되며, 보유 주식 수에 따라 받을 금액이 달라집니다.',
            '배당이 지급되면 포트폴리오가 다시 조회되어 총자산에 반영됩니다.',
          ]}
        />
        <GuideSection
          title="계정과 초기화"
          items={[
            '게스트로 바로 시작할 수 있고, 나중에 Google 계정으로 연동할 수 있습니다.',
            '계정 연동 시 게스트 데이터를 기존 Google 계정으로 이어서 사용할 수 있게 처리합니다.',
            '투자금 초기화는 보유 종목이 없을 때 가능하며, 하루 제한 횟수 안에서 실행됩니다.',
          ]}
        />
      </div>
      <LegalFooter />
    </div>
  );
};

function GuideSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section
      className="rounded-xl border p-4 md:p-5"
      style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}
    >
      <h3 className="text-sm md:text-base font-black mb-3" style={{ color: 'var(--text-secondary)' }}>
        {title}
      </h3>
      <ul className="space-y-2.5">
        {items.map(item => (
          <li key={item} className="flex gap-2.5 text-xs md:text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
