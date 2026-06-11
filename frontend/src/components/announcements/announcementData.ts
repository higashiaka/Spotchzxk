export interface AnnouncementSection {
  title: string;
  rows?: { label: string; value: string; tone?: 'accent' | 'danger' }[];
  table?: {
    headers: string[];
    rows: string[][];
  };
  note?: string;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  date: string;
  summary: string;
  sections: AnnouncementSection[];
}

export const announcements: AnnouncementItem[] = [
  {
    id: 'notice_dividend_volume_based_20260611',
    title: '배당률 산정 방식 변경 안내',
    date: '운영 정책 업데이트',
    summary: '앞으로 배당률은 종목의 최근 거래 흐름에 따라 결정됩니다. 거래가 활발한 종목일수록 배당 재원이 커지고, 거래가 적은 종목은 배당이 줄어들 수 있습니다.',
    sections: [
      {
        title: '배당률 변경',
        rows: [
          { label: '변경 후', value: '최근 거래량에 비례해 배당률 결정', tone: 'accent' },
          { label: '지급 주기', value: '방송 중 1시간마다 지급', tone: 'accent' },
          { label: '배당 대상', value: '방송 시작 시점 보유 수량 기준', tone: 'accent' },
        ],
        note: '거래가 활발한 종목은 배당률이 높아질 수 있고, 거래가 거의 없는 종목은 배당이 지급되지 않을 수 있습니다.',
      },
    ],
  },
  {
    id: 'notice_official_launch_20260701',
    title: '베타 서비스 종료 및 정식 서비스 전환 안내',
    date: '정식 서비스 전환',
    summary: '6월 30일 베타 서비스가 종료되고 7월 1일부터 정식 서비스가 시작됩니다. 거래 로직이 개선되며, 정식 서비스 전환 시 상장 종목과 전체 자산이 초기화됩니다.',
    sections: [
      {
        title: '베타 서비스 종료 일정',
        rows: [
          { label: '베타 종료', value: '2026년 6월 30일 (월)', tone: 'danger' },
          { label: '정식 서비스 시작', value: '2026년 7월 1일 (화)', tone: 'accent' },
        ],
        note: '베타 서비스 기간 동안 참여해주신 모든 분들께 감사드립니다.',
      },
      {
        title: '정식 서비스 전환 시 초기화 항목',
        rows: [
          { label: '상장 종목', value: '전체 상장 종목 초기화', tone: 'danger' },
          { label: '보유 주식', value: '전체 보유 수량 초기화', tone: 'danger' },
          { label: '잔고', value: '코인 잔고 초기화', tone: 'danger' },
          { label: '거래 내역', value: '기존 체결 내역 초기화', tone: 'danger' },
        ],
        note: '초기화는 7월 1일 정식 서비스 시작 전 일괄 처리됩니다.',
      },
      {
        title: '베타 참여자 혜택',
        rows: [
          { label: '대상', value: '베타 서비스 참여 이용자 전원', tone: 'accent' },
          { label: '혜택 내용', value: '추후 별도 공지 예정', tone: 'accent' },
        ],
        note: '혜택 세부 내용은 정식 서비스 시작 전 공지를 통해 안내드릴 예정입니다.',
      },
      {
        title: '거래 로직 변경',
        rows: [
          { label: 'AMM 가격 결정', value: 'x×y=k 유동성 풀 기반 가격 결정 방식 정식 적용', tone: 'accent' },
          { label: '슬리피지 보호', value: '대량 주문 시 예상 체결가 범위를 초과하면 주문 거부', tone: 'accent' },
          { label: '수수료', value: '거래 수수료 1.5% 적용 (기존과 동일)', tone: 'accent' },
          { label: '평균 체결가', value: '수수료 포함 실제 지불 금액 기준으로 평균가 산출', tone: 'accent' },
          { label: '초기 잔고', value: '신규 계정 지급 금액 1,000만원으로 조정', tone: 'accent' },
        ],
        note: '지정가 예약 주문 기능은 기존과 동일하게 유지됩니다.',
      },
    ],
  },
  {
    id: 'notice_update_20260610',
    title: '후원왕 랭킹 추가 및 운영 정책 변경 안내',
    date: '운영 정책 업데이트',
    summary: '후원왕 랭킹이 추가되었고, 배당 지급률·액면분할 주기·확성기 횟수 제한이 조정됩니다.',
    sections: [
      {
        title: '후원왕 랭킹 추가',
        rows: [
          { label: '기능', value: '상점 탭에서 원하는 금액을 후원할 수 있습니다', tone: 'accent' },
          { label: '반영', value: '후원 금액은 잔고에서 차감되고 후원왕 랭킹에 누적', tone: 'accent' },
          { label: '초기화', value: '매일 자정 랭킹 초기화', tone: 'accent' },
        ],
        note: '유저 랭킹 탭에서 실현손익·배당수익·후원왕 세 가지 랭킹을 확인할 수 있습니다.',
      },
      {
        title: '배당 지급률 조정',
        rows: [
          { label: '변경 후', value: '주당 현재가의 0.01% 지급', tone: 'accent' },
          { label: '기존', value: '주당 현재가의 0.7% 지급', tone: 'danger' },
        ],
        note: '지급 주기(1시간)와 대상 기준은 동일합니다.',
      },
      {
        title: '액면분할 주기 조정',
        rows: [
          { label: '변경 후', value: '6시간마다 정각 실행', tone: 'accent' },
          { label: '실행 시간', value: '00시, 06시, 12시, 18시 KST', tone: 'accent' },
          { label: '기존', value: '3시간마다 정각 실행', tone: 'danger' },
        ],
      },
      {
        title: '확성기 일일 횟수 제한 변경',
        rows: [
          { label: '변경 후', value: '1일 5회', tone: 'accent' },
          { label: '기존', value: '1일 3회', tone: 'danger' },
        ],
      },
      {
        title: '비로그인 시세 열람 허용',
        rows: [
          { label: '변경', value: '로그인 없이도 종목 시세·차트 확인 가능', tone: 'accent' },
        ],
        note: '매수·매도 등 거래 기능은 로그인 후 이용할 수 있습니다.',
      },
    ],
  },
  {
    id: 'notice_schedule_update_20260608',
    title: '배당 지급 및 액면분할 주기 변경 안내',
    date: '운영 정책 업데이트',
    summary: '배당 지급은 방송 시작 후 1시간마다, 액면분할은 3시간마다 정각에 실행되도록 변경됩니다.',
    sections: [
      {
        title: '배당 지급 주기',
        rows: [
          { label: '변경 후', value: '방송 시작 후 1시간마다 지급', tone: 'accent' },
          { label: '기존', value: '방송 시작 후 10분마다 지급', tone: 'danger' },
        ],
        note: '배당 대상과 계산 방식은 기존 정책을 따르며, 지급 간격만 변경됩니다.',
      },
      {
        title: '액면분할 주기',
        rows: [
          { label: '변경 후', value: '3시간마다 정각 실행', tone: 'accent' },
          { label: '실행 시간', value: '00시, 03시, 06시, 09시, 12시, 15시, 18시, 21시 KST', tone: 'accent' },
          { label: '기존', value: '매일 오전 9시 KST', tone: 'danger' },
        ],
        note: '분할 대상 기준과 제외 대상은 기존 액면분할 정책과 동일합니다.',
      },
    ],
  },
  {
    id: 'notice_split_limit_policy_20260608',
    title: '매수·배당 제한 해제 및 액면분할 안내',
    date: '운영 정책 업데이트',
    summary: '일반 종목 보유 제한과 배당 상한을 해제하고, 고가 종목은 3시간마다 정각 기준으로 10:1 액면분할을 적용합니다.',
    sections: [
      {
        title: '제한 해제',
        rows: [
          { label: '매수 제한', value: '종목당 1,000주 보유 제한 해제', tone: 'accent' },
          { label: '배당 제한', value: '보유 수량 전체 기준으로 배당 지급', tone: 'accent' },
          { label: '신규 상장', value: '상장 후 24시간 200주 매수 제한은 유지', tone: 'danger' },
        ],
        note: '신규 상장 초기 보호 장치는 유지되며, 일반 보유 상한과 배당 상한만 해제됩니다.',
      },
      {
        title: '액면분할 기준',
        rows: [
          { label: '실행 시간', value: '3시간마다 정각 KST', tone: 'accent' },
          { label: '대상', value: '현재가 1,000,000원 초과 종목', tone: 'accent' },
          { label: '비율', value: '10:1 액면분할', tone: 'accent' },
        ],
        note: '상장 후 24시간이 지나지 않은 종목과 이벤트 상장 종목은 액면분할 대상에서 제외됩니다.',
      },
      {
        title: '분할 반영 방식',
        rows: [
          { label: '가격', value: '현재가와 기준가를 1/10로 조정', tone: 'accent' },
          { label: '수량', value: '보유 수량과 미체결 지정가 주문 수량을 10배로 조정', tone: 'accent' },
          { label: '차트', value: '분할 전 가격도 현재 기준으로 보정 표시', tone: 'accent' },
        ],
        note: '분할된 종목 목록은 당일 공지 팝업으로 안내됩니다.',
      },
    ],
  },
  {
    id: 'notice_wash_trading_clawback',
    title: '자전거래 부당이득 회수 안내',
    date: '운영 조치',
    summary: '최근 주문 1,000건을 검토하여 자전거래로 발생한 부당이득을 회수하였으며, 동일한 방식의 이익 발생을 구조적으로 차단하였습니다.',
    sections: [
      {
        title: '조치 내용',
        rows: [
          { label: '검토 범위', value: '최근 주문 1,000건', tone: 'accent' },
          { label: '부당이득 회수', value: '자전거래로 확인된 실현 수익 회수 완료', tone: 'danger' },
          { label: '구조 개선', value: '매수·매도 가격 충격 공식 대칭화 적용', tone: 'accent' },
        ],
        note: '동일 수량을 매수 후 매도하면 가격이 원래 수준으로 복귀하도록 수정되었습니다.',
      },
      {
        title: '기준',
        rows: [
          { label: '대상', value: '자전거래 패턴으로 발생한 비정상 실현 수익', tone: 'danger' },
        ],
        note: '정상적인 거래로 발생한 수익은 이번 조치와 무관합니다.',
      },
    ],
  },
  {
    id: 'notice_event_guobao_listing',
    title: '궈바오 신규 상장 안내',
    date: '이벤트 상장',
    summary: '이벤트성 특별 종목 궈바오가 신규 상장됩니다. 일반 종목과 다른 운영 기준이 적용될 수 있습니다.',
    sections: [
      {
        title: '상장 정보',
        rows: [
          { label: '종목명', value: '궈바오', tone: 'accent' },
          { label: '상장가', value: '10,000,000원', tone: 'accent' },
        ],
      },
      {
        title: '운영 안내',
        rows: [
          { label: '배당', value: '배당이 지급되지 않는 종목', tone: 'accent' },
          { label: '종목 성격', value: '이벤트성으로 추가된 특별 종목', tone: 'accent' },
        ],
        note: '이벤트 운영 상황에 따라 별도 공지 없이 상장폐지될 수 있습니다.',
      },
    ],
  },
  {
    id: 'notice_limit_order_reservation',
    title: '지정가 예약 주문 안내',
    date: '최근 업데이트',
    summary: '시장가 주문 외에 원하는 가격을 지정해 대기하는 예약 주문 기능이 추가되었습니다.',
    sections: [
      {
        title: '주문 방식',
        rows: [
          { label: '시장가', value: '현재가 기준 즉시 체결', tone: 'accent' },
          { label: '지정가', value: '조건 충족 전까지 대기 주문으로 저장', tone: 'accent' },
        ],
        note: '지정가 주문은 현재가가 조건에 닿으면 자동으로 체결됩니다.',
      },
      {
        title: '대기 주문과 호가창',
        rows: [
          { label: '내 대기 주문', value: '미체결 지정가 확인 및 취소 가능', tone: 'accent' },
          { label: '호가창', value: '대기 중인 지정가 매수/매도 수량 표시', tone: 'accent' },
        ],
        note: '시장가 주문은 호가창에 쌓이지 않고 즉시 체결되며, 가격 변동을 통해 지정가 주문을 체결시킬 수 있습니다.',
      },
      {
        title: '예약금 안내',
        rows: [
          { label: '지정가 매수', value: '주문 금액 예약 차감, 취소 시 환불', tone: 'accent' },
          { label: '지정가 매도', value: '보유 수량 범위 안에서 대기 주문 등록', tone: 'accent' },
        ],
      },
    ],
  },
  {
    id: 'notice_update_v7',
    title: '고래 방지 정책 도입',
    date: '최근 업데이트',
    summary: '특정 유저의 신규 상장 독점 및 대량 매집을 방지하기 위한 보유 한도가 적용됩니다.',
    sections: [
      {
        title: '종목당 보유 한도',
        rows: [
          { label: '최대 보유', value: '1인당 1,000개', tone: 'accent' },
        ],
        note: '한도 초과 보유자는 해당 종목 추가 매수가 제한됩니다.',
      },
      {
        title: '신규 상장 초기 제한',
        rows: [
          { label: '상장 후 24시간', value: '1인당 최대 200개', tone: 'accent' },
        ],
        note: '신규 상장 직후 대량 매집을 막기 위한 조치입니다.',
      },
      {
        title: '배당 상한',
        rows: [
          { label: '배당 기준', value: '보유량 최대 1,000개까지만 지급', tone: 'accent' },
        ],
        note: '1,000개 초과 보유분에 대해서는 배당이 지급되지 않습니다.',
      },
    ],
  },
  {
    id: 'notice_update_v6',
    title: '상점 가격 조정 & 확성기 변경',
    date: '최근 업데이트',
    summary: '확성기와 종목 추가 티켓 가격이 내려갔고, 확성기는 라이브 중인 방송에서만 표시됩니다.',
    sections: [
      {
        title: '확성기 가격 인하',
        rows: [
          { label: '변경 후', value: '3,000만원', tone: 'accent' },
          { label: '기존', value: '10억원', tone: 'danger' },
        ],
      },
      {
        title: '종목 추가 티켓 가격 인하',
        rows: [
          { label: '변경 후', value: '1,000만원', tone: 'accent' },
          { label: '기존', value: '3,000만원', tone: 'danger' },
        ],
      },
      {
        title: '확성기 자동 만료',
        rows: [
          { label: '적용', value: '라이브 중인 방송의 확성기만 표시', tone: 'accent' },
        ],
        note: '방송이 종료되면 다음 목록 갱신 때 해당 확성기는 자동으로 사라집니다.',
      },
    ],
  },
  {
    id: 'notice_update_v5',
    title: '업데이트 안내',
    date: '최근 업데이트',
    summary: '배당, 상점 아이템, 유저 랭킹이 추가되었습니다.',
    sections: [
      {
        title: '배당 정책 변경',
        rows: [
          { label: '변경 후', value: '주당 현재가의 0.7% 지급', tone: 'accent' },
          { label: '기존', value: '발행량/유통량 기준 배당 계산', tone: 'danger' },
        ],
      },
      {
        title: '닉네임 변경권 출시',
        rows: [{ label: '비용', value: '1,000,000원', tone: 'accent' }],
        note: '프로필 화면에서 이름 옆 편집 버튼으로 변경',
      },
      {
        title: '종목 추가 티켓 출시',
        rows: [{ label: '비용', value: '30,000,000원', tone: 'accent' }],
        note: '프로필 화면에서 치지직 채널 URL로 종목 추가',
      },
      {
        title: '유저 랭킹 추가',
        rows: [{ label: '기준', value: '누적 실현 수익 순위', tone: 'accent' }],
        note: '설정에서 랭킹 닉네임 공개 여부를 선택할 수 있습니다',
      },
    ],
  },
  {
    id: 'notice_update_v4',
    title: '거래 화면 개선',
    date: '이전 업데이트',
    summary: '실시간 체결 피드와 보유 종목 흐름을 다듬었습니다.',
    sections: [
      {
        title: '실시간 거래 피드',
        rows: [{ label: '추가', value: '홈에서 최근 체결 내역을 실시간 표시', tone: 'accent' }],
        note: '종목을 누르면 시세 상세로 바로 이동할 수 있습니다',
      },
      {
        title: '보유 종목 상세',
        rows: [{ label: '기준', value: '평가금액, 수익률, 최근거래 정렬', tone: 'accent' }],
        note: '평단가와 매입 대비 손익을 함께 확인할 수 있습니다',
      },
    ],
  },
  {
    id: 'notice_update_v3',
    title: '차트와 시세 강화',
    date: '이전 업데이트',
    summary: '종목별 시세 상세와 차트 탐색 기능이 보강되었습니다.',
    sections: [
      {
        title: '캔들 차트',
        rows: [{ label: '지원', value: '1분, 5분, 1시간, 일봉, 주봉', tone: 'accent' }],
        note: '체결 가격을 기준으로 시가, 고가, 저가, 종가를 표시합니다',
      },
      {
        title: '랭킹 차트',
        rows: [{ label: '정렬', value: '거래량, 거래대금, 급상승, 급하락', tone: 'accent' }],
        note: '거래대금은 큰 금액을 억/만 단위로 축약해 보여줍니다',
      },
    ],
  },
];

export const latestAnnouncement = announcements[0];
