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
            '치지직 스트리머를 하나의 종목처럼 보고, 현재가를 기준으로 매수와 매도를 합니다.',
            '처음 시작하면 투자금 1,000만원으로 거래를 시작합니다.',
            '홈에서는 내 자산, 최근 체결, 최근 본 종목, 거래량 상위 종목을 빠르게 확인합니다.',
          ]}
        />
        <GuideSection
          title="가격이 움직이는 방식"
          items={[
            '가격은 AMM(자동화된 시장 조성자) 방식으로 결정됩니다. 유동성 풀의 코인 잔액 ÷ 주식 잔액이 현재가입니다.',
            '매수하면 풀에서 주식이 빠져나가며 가격이 오르고, 매도하면 주식이 풀로 돌아오며 가격이 내려갑니다.',
            '주문 수량이 클수록 가격 영향(슬리피지)이 커집니다. 유동성이 낮은 종목일수록 동일 수량에 대한 영향이 큽니다.',
            '시세 화면의 캔들 차트는 체결 데이터를 시간 단위로 묶어 시가·고가·저가·종가를 보여줍니다.',
            '등락률은 오늘 기준가 대비 현재가 변화율이며, 기준가는 매일 자정 직전 현재가로 갱신됩니다.',
          ]}
        />
        <GuideSection
          title="수수료"
          items={[
            '모든 체결에는 거래 금액의 1.5% 수수료가 부과됩니다.',
            '수수료의 2/3(약 1%)는 해당 종목의 배당 풀에 적립되고, 나머지 1/3(약 0.5%)은 운영 수수료입니다.',
            '매수 시 수수료는 지불 금액에 추가되고, 매도 시 수수료는 수령 금액에서 차감됩니다.',
          ]}
        />
        <GuideSection
          title="주문 사용법"
          items={[
            '시세에서 종목을 선택한 뒤 빠른 주문 또는 주문 탭에서 매수와 매도를 실행합니다.',
            '시장가 주문은 AMM 풀 기준으로 예상 금액을 계산하고, 서버 체결 후 잔고와 보유 수량이 갱신됩니다.',
            '지정가 주문은 원하는 가격에 대기하다가 해당 가격 이하(매수) 또는 이상(매도) 조건이 충족되면 체결됩니다.',
            '매수는 현금 잔고 안에서만, 매도는 보유 수량 안에서만 가능합니다.',
          ]}
        />
        <GuideSection
          title="배당"
          items={[
            '스트리머가 라이브를 시작하면 배당 카운트가 시작됩니다.',
            '라이브 시작 후 매 60분마다 해당 종목 배당 풀의 35%가 주주에게 지급됩니다.',
            '배당은 라이브 시작 전에 보유하고 있던 수량 기준으로 지급됩니다. 라이브 중 매수한 물량은 해당 회차 배당 대상에서 제외됩니다.',
            '배당 수령 내역은 프로필의 배당 내역에서 확인할 수 있습니다.',
          ]}
        />
        <GuideSection
          title="차트와 랭킹"
          items={[
            '차트 탭에서는 거래량, 거래대금, 급상승, 급하락, 신규상장, 배당 기준으로 종목을 정렬할 수 있습니다.',
            '거래대금은 당일 모든 체결의 체결가×수량 누적값이며, 큰 금액은 억/만 단위로 줄여 표시합니다.',
            '랭킹 탭에서는 실현손익과 배당수익 두 가지 기준으로 유저 순위를 확인할 수 있습니다.',
            '설정에서 닉네임 공개 여부를 변경할 수 있습니다.',
          ]}
        />
        <GuideSection
          title="계정과 초기화"
          items={[
            '게스트로 바로 시작할 수 있고, 나중에 Google 또는 Naver 계정으로 연동할 수 있습니다.',
            '계정 연동 시 게스트 데이터를 연동 계정으로 이어서 사용할 수 있습니다.',
            '투자금 초기화는 보유 종목이 없을 때 가능하며, 하루 3회까지 실행할 수 있습니다.',
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
