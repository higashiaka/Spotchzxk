import { useState } from 'react';
import { createPortal } from 'react-dom';

type LegalTab = 'terms' | 'privacy';

type LegalSection = {
  title: string;
  body: string[];
};

const SERVICE_NAME = 'Spotchzxk';
const OPERATOR_NAME = 'Spotchzxk 운영자';
const CONTACT_EMAIL = 'help@spotchzxk.xyz';
const EFFECTIVE_DATE = '2026년 6월 30일';

const terms: LegalSection[] = [
  {
    title: '제1조 (목적)',
    body: [
      `본 약관은 ${OPERATOR_NAME}(이하 "운영자")가 제공하는 ${SERVICE_NAME}(이하 "서비스")의 이용 조건과 운영자 및 회원의 권리, 의무, 책임사항을 정하는 것을 목적으로 합니다.`,
    ],
  },
  {
    title: '제2조 (서비스의 성격)',
    body: [
      '서비스는 치지직(CHZZK) 스트리머 관련 공개 정보를 활용한 오락 및 커뮤니티 서비스입니다.',
      '서비스의 주식, 종목, 거래, 배당, 랭킹, 칭호 등의 표현은 오락적 장치이며 금융투자상품, 증권, 선물, 투자 자문 또는 수익 보장을 의미하지 않습니다.',
      '서비스 내 포인트, 아이템, 칭호, 티켓, 종목 등은 현금 가치가 없으며 현금 또는 현금성 재화로 환불, 환전, 보상되지 않습니다.',
    ],
  },
  {
    title: '제3조 (회원가입 및 계정)',
    body: [
      '회원은 Google, Naver, 게스트 로그인 등 서비스가 제공하는 인증 방식으로 서비스를 이용할 수 있습니다.',
      '서비스는 만 14세 이상만 이용할 수 있습니다.',
      '회원은 계정을 제3자에게 양도, 대여, 공유해서는 안 되며 계정 도용 또는 부정 이용이 확인되면 이용이 제한될 수 있습니다.',
    ],
  },
  {
    title: '제4조 (서비스 제공 및 변경)',
    body: [
      '서비스는 연중무휴 제공을 원칙으로 하나 시스템 점검, 장애, 외부 플랫폼 또는 인프라 사정, 천재지변 등으로 중단될 수 있습니다.',
      '운영자는 운영상 또는 기술상 필요에 따라 서비스의 전부 또는 일부를 변경, 제한, 중단하거나 종료할 수 있습니다.',
    ],
  },
  {
    title: '제5조 (금지행위)',
    body: [
      '자동화 프로그램, 봇, 비정상 요청, 취약점 악용 등을 통해 서비스를 이용하거나 재화를 취득하는 행위',
      '데이터 무단 수집, 복제, 우회 접근, 과도한 트래픽 유발, 서비스 운영 방해 행위',
      '허위 사실, 비방, 명예훼손, 음란물, 불법 콘텐츠, 권리 침해 콘텐츠를 게시하는 행위',
      '서비스 내 재화, 종목, 계정, 칭호 등을 현금 또는 현금성 재화로 거래하거나 이를 알선하는 행위',
    ],
  },
  {
    title: '제6조 (스트리머 정보 및 종목)',
    body: [
      '서비스에 표시되는 스트리머 닉네임, 프로필, 시청자 수 등은 공개 정보, 공개 API 및 서비스 자체 집계 정보를 기반으로 합니다.',
      '본 서비스는 스트리머, 소속사, 방송 플랫폼과 제휴, 허가, 공식 관계가 없는 비공식 팬 커뮤니티이며 공식 인증을 의미하지 않습니다.',
      `스트리머 본인 또는 정당한 권리자는 자신의 정보 또는 종목 노출 중단을 ${CONTACT_EMAIL}으로 요청할 수 있습니다.`,
    ],
  },
  {
    title: '제7조 (콘텐츠와 광고)',
    body: [
      '회원이 작성한 콘텐츠에 대한 책임은 원칙적으로 해당 회원에게 있습니다.',
      '운영자는 불법이거나 본 약관에 반하는 콘텐츠를 삭제, 이동, 숨김 또는 접근 제한할 수 있습니다.',
      '운영자는 서비스 운영을 위해 화면 또는 연결 페이지에 광고를 게재할 수 있습니다.',
    ],
  },
  {
    title: '제8조 (면책 및 준거법)',
    body: [
      '서비스는 오락 및 커뮤니티 목적으로 제공되며 운영자는 정보의 정확성, 완전성, 지속성을 보증하지 않습니다.',
      '외부 플랫폼, 인프라 제공자, 회원의 귀책, 천재지변 등 운영자의 합리적 통제를 벗어난 사유로 발생한 손해에 대해 운영자는 책임을 지지 않습니다.',
      '본 약관은 대한민국 법령에 따르며, 분쟁의 관할은 관련 법령에 따릅니다.',
    ],
  },
];

const privacy: LegalSection[] = [
  {
    title: '제1조 (수집하는 개인정보)',
    body: [
      '서비스는 Google, Naver 등 소셜 로그인 제공자가 전달하는 이용자 식별값, 이메일, 닉네임, 프로필 이미지 등 이용자가 동의한 정보를 수집할 수 있습니다.',
      '게스트 이용 시 서비스 이용을 위한 익명 식별값과 기기 또는 브라우저 기반의 중복 이용 방지 정보가 생성될 수 있습니다.',
      '서비스 이용 과정에서 보유 재화, 보유 종목, 주문 및 거래 내역, 배당 내역, 칭호, 설정, 게시물, 댓글, 피드백, 확성기 메시지, 접속 IP, 쿠키, 접속 일시, 기기 및 브라우저 정보, 서비스 이용 기록이 생성 또는 수집될 수 있습니다.',
    ],
  },
  {
    title: '제2조 (이용 목적)',
    body: [
      '회원 식별, 로그인, 계정 연동, 중복 가입 및 부정 이용 방지',
      '가상 재화, 종목 거래, 랭킹, 칭호, 커뮤니티 등 서비스 제공 및 운영',
      '문의, 피드백, 신고, 민원 처리, 공지 전달, 서비스 안정성 확보, 보안, 장애 대응, 통계 분석 및 품질 개선',
      '광고 게재 및 광고 성과 측정',
    ],
  },
  {
    title: '제3조 (보유 및 이용 기간)',
    body: [
      '개인정보는 원칙적으로 회원 탈퇴 또는 처리 목적 달성 시 지체 없이 파기합니다.',
      '다만 부정 이용 방지, 분쟁 대응, 보안 로그 보관 등 운영상 필요한 정보는 최대 1년간 보관할 수 있습니다.',
      '관계 법령에 따라 보존이 필요한 경우 해당 법령에서 정한 기간 동안 보관합니다.',
    ],
  },
  {
    title: '제4조 (제3자 제공 및 처리 위탁)',
    body: [
      '서비스는 이용자의 개인정보를 외부에 판매하거나 제공하지 않습니다. 다만 이용자의 동의, 법령의 근거, 수사기관의 적법한 요청이 있는 경우는 예외로 합니다.',
      '서비스 운영을 위해 Oracle Cloud Infrastructure, Cloudflare, Google 및 Firebase, Naver, Discord 등 운영 도구에 개인정보 처리를 위탁하거나 서비스 제공 과정에서 일부 정보가 국외 이전될 수 있습니다.',
    ],
  },
  {
    title: '제5조 (정보주체의 권리)',
    body: [
      `이용자는 서비스 내 설정 또는 ${CONTACT_EMAIL}을 통해 개인정보 열람, 정정, 삭제, 처리정지를 요청할 수 있습니다.`,
      '운영자는 관련 법령에 따라 지체 없이 조치합니다.',
    ],
  },
  {
    title: '제6조 (쿠키 및 행태정보)',
    body: [
      '서비스는 로그인 유지, 이용 편의, 보안, 광고 제공을 위해 쿠키를 사용할 수 있습니다.',
      '서비스에는 Google AdSense 광고가 게재될 수 있으며 Google 및 광고 파트너는 광고 제공과 성과 측정을 위해 쿠키 등 행태정보를 수집, 이용할 수 있습니다.',
      '이용자는 Google 광고 설정(https://adssettings.google.com) 또는 브라우저 쿠키 차단을 통해 맞춤형 광고를 제한할 수 있습니다.',
    ],
  },
  {
    title: '제7조 (개인정보 보호책임자)',
    body: [
      `책임자: ${OPERATOR_NAME}`,
      `연락처: ${CONTACT_EMAIL}`,
      '개인정보 관련 문의, 불만, 피해구제 요청은 위 연락처로 접수할 수 있습니다.',
    ],
  },
];

const meta = {
  terms: `시행일자: ${EFFECTIVE_DATE}`,
  privacy: `공고일자 및 시행일자: ${EFFECTIVE_DATE}`,
};

const renderSections = (sections: LegalSection[]) => (
  <div className="space-y-5">
    {sections.map((section) => (
      <section key={section.title} className="space-y-2">
        <h3 className="text-sm font-black text-main-token">{section.title}</h3>
        <div className="space-y-1.5">
          {section.body.map((line) => (
            <p key={line} className="text-xs leading-6 text-muted-token">
              {line}
            </p>
          ))}
        </div>
      </section>
    ))}
  </div>
);

export const LegalModal = ({
  initialTab,
  onClose,
}: {
  initialTab: LegalTab;
  onClose: () => void;
}) => {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);
  const title = activeTab === 'terms' ? '이용약관' : '개인정보처리방침';

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm md:max-w-2xl max-h-[82vh] overflow-hidden rounded-xl border shadow-2xl flex flex-col"
        style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-black text-main-token">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-token hover:bg-white/10 transition-colors"
            aria-label="닫기"
            title="닫기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg p-1" style={{ background: 'var(--bg-sidebar)' }}>
            {(['terms', 'privacy'] as LegalTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="h-9 rounded-md text-xs font-bold transition-colors"
                style={{
                  background: activeTab === tab ? 'var(--accent-soft)' : 'transparent',
                  color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {tab === 'terms' ? '이용약관' : '개인정보처리방침'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 hide-scrollbar">
          {activeTab === 'terms' ? renderSections(terms) : renderSections(privacy)}
          <p className="mt-6 text-[11px] font-bold text-dim-token">
            {activeTab === 'terms' ? meta.terms : meta.privacy}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export type { LegalTab };
