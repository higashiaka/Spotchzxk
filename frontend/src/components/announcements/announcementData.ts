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
    id: 'notice_daily_attendance_reward_20260709',
    title: '일일 출석 보상 추가 안내',
    date: '2026년 7월 9일',
    summary: '매일 출석하면 보상을 받을 수 있는 일일 출석 보상 기능이 추가되었습니다. 연속 출석 일수에 따라 추가 보상도 지급됩니다.',
    sections: [
      {
        title: '이용 방법',
        rows: [
          { label: '위치', value: '상점 탭 → 일일 출석 보상', tone: 'accent' },
          { label: '수령 조건', value: '하루 1회, 로그인 상태에서 수령', tone: 'accent' },
        ],
        note: '연속 출석이 끊기면 출석일이 초기화됩니다.',
      },
      {
        title: '마일스톤 보상',
        rows: [
          { label: '보상 종류', value: '현금 또는 아이템(확성기 티켓, 닉네임 변경권, 종목 추가권)', tone: 'accent' },
          { label: '지급 기준', value: '연속 출석일에 따라 보상 내용이 달라집니다', tone: 'accent' },
        ],
      },
    ],
  },
  {
    id: 'notice_initial_balance_policy_20260703',
    title: '초기 자본 정책 변경 안내',
    date: '2026년 7월 3일',
    summary: '로그인 방식에 따라 지급되는 초기 자본 금액이 변경됩니다. 네이버 계정 연동 시 추가 자본이 지급되며, 기존 구글 계정 유저에게도 차액이 일괄 지급됩니다.',
    sections: [
      {
        title: '초기 자본 변경',
        table: {
          headers: ['로그인 방식', '초기 자본'],
          rows: [
            ['구글 로그인', '2,000만원'],
            ['네이버 로그인', '3,000만원'],
          ],
        },
        note: '신규 가입 계정부터 적용됩니다.',
      },
      {
        title: '네이버 계정 연동 보너스',
        rows: [
          { label: '지급 조건', value: '구글 계정에 네이버 계정 최초 연동 시', tone: 'accent' },
          { label: '지급 금액', value: '+3,000만원', tone: 'accent' },
        ],
        note: '네이버 단독 계정이거나 이미 연동된 계정에는 지급되지 않습니다.',
      },
      {
        title: '기존 구글 계정 유저 일괄 지급',
        rows: [
          { label: '지급 대상', value: '네이버 미연동 기존 구글 로그인 계정 전체', tone: 'accent' },
          { label: '지급 금액', value: '+1,000만원 (신규 정책 차액)', tone: 'accent' },
        ],
        note: '게스트 계정은 지급 대상에서 제외됩니다.',
      },
      {
        title: '자금 초기화 기준',
        rows: [
          { label: '구글 계정', value: '2,000만원으로 초기화', tone: 'accent' },
          { label: '네이버 연동 구글 계정', value: '5,000만원으로 초기화', tone: 'accent' },
          { label: '네이버 단독 계정', value: '3,000만원으로 초기화', tone: 'accent' },
        ],
      },
    ],
  },
  {
    id: 'notice_official_open_20260630',
    title: 'Spotchzxk 정식 오픈',
    date: '2026년 6월 30일',
    summary: '치지직 스트리머 주식 거래소 Spotchzxk이 정식 서비스를 시작합니다. 베타 테스트에 참여해주신 모든 분들께 감사드립니다.',
    sections: [
      {
        title: '베타 참여자 보상 지급 완료',
        rows: [
          { label: '종목 추가권', value: '10개 지급', tone: 'accent' },
          { label: '칭호', value: '베타 참여자 칭호 지급', tone: 'accent' },
        ],
        note: '칭호 선택은 설정 화면에서 가능합니다.',
      },
      {
        title: '예정',
        rows: [
          { label: '네이버 로그인', value: '7월 첫째주 중 지원 예정', tone: 'accent' },
        ],
      },
    ],
  },
  {
    id: 'notice_feedback_center_20260624',
    title: '문의 및 건의 창구 신설 안내',
    date: '2026년 6월 24일',
    summary: '사이트 안에서 오류 신고와 기능 건의를 접수하고, 내 문의 내역과 운영자 답변을 확인할 수 있는 문의 창구가 추가되었습니다.',
    sections: [
      {
        title: '문의 창구 이용 안내',
        rows: [
          { label: '접수 위치', value: '프로필 → 문의 및 건의', tone: 'accent' },
          { label: '문의 유형', value: '오류 · 기능 건의 · 계정/거래 · 종목 · 신고 · 기타' },
          { label: '관련 종목', value: '종목과 관련된 문의는 해당 종목을 선택 가능' },
        ],
        note: '문의 내용은 운영자에게 전달되며, 비밀번호나 인증 토큰 등 민감한 개인정보는 입력하지 마세요.',
      },
      {
        title: '답변 확인',
        rows: [
          { label: '확인 위치', value: '문의 및 건의 → 내 문의 내역', tone: 'accent' },
          { label: '처리 상태', value: '접수됨 · 답변 완료' },
          { label: '운영자 답변', value: '답변이 등록되면 문의 상세에서 확인 가능', tone: 'accent' },
        ],
      },
    ],
  },
  {
    id: 'notice_beta_reward_eligibility_20260629',
    title: '베타 보상 지급 기준 안내',
    date: '2026년 6월 29일 18:00 기준',
    summary: '베타 보상과 칭호는 2026년 6월 29일 18시(KST)의 계정 상태 및 기록을 기준으로 지급됩니다.',
    sections: [
      {
        title: '보상 지급 기준',
        rows: [
          { label: '기준 시각', value: '2026년 6월 29일 18:00 (KST)', tone: 'danger' },
          { label: '지급 대상', value: '기준 시각 이전까지 구글 계정 연동을 완료한 계정', tone: 'accent' },
          { label: '칭호 지급', value: '기준 시각의 순위 및 기록을 기준으로 확정', tone: 'accent' },
        ],
        note: '게스트 계정은 기준 시각 이전에 구글 계정 연동을 완료해야 베타 보상 지급 대상에 포함됩니다. 기준 시각 이후의 계정 연동이나 순위·기록 변동은 이번 보상 및 칭호 산정에 반영되지 않습니다.',
      },
    ],
  },
  {
    id: 'notice_trading_suspension_20260613',
    title: '거래 정지 제도 도입 안내',
    date: '운영 정책 업데이트',
    summary: '채널이 삭제되거나 장기간 방송이 없어 API 응답이 불가능한 종목은 자동으로 거래가 정지됩니다.',
    sections: [
      {
        title: '거래 정지 조건',
        rows: [
          { label: '정지 조건', value: '10분 이상 연속으로 API 응답 없음', tone: 'danger' },
          { label: '해당 사례', value: '채널 삭제 · 채널 정지 · 장기 미방송', tone: 'danger' },
          { label: '자동 해제', value: 'API 응답 복구 시 즉시 거래 재개', tone: 'accent' },
        ],
        note: '거래 정지 중에는 매수·매도가 모두 차단됩니다. 종목 화면에서 "거래 정지" 배너로 확인할 수 있습니다.',
      },
    ],
  },
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
    title: '팬 랭킹 추가 및 운영 정책 변경 안내',
    date: '운영 정책 업데이트',
    summary: '종목별 팬 랭킹 구성이 추가되었고, 배당 지급률·액면분할 주기·확성기 횟수 제한이 조정됩니다.',
    sections: [
      {
        title: '종목별 팬 랭킹 추가',
        rows: [
          { label: '기능', value: '스트리머 종목별로 팬 후원을 집계합니다', tone: 'accent' },
          { label: '칭호', value: '상위 후원자는 “OO 스트리머의 팬” 칭호 대상', tone: 'accent' },
          { label: '초기화', value: '시즌 또는 운영 정책 기준으로 정산', tone: 'accent' },
        ],
        note: '유저 랭킹 탭에서는 실현손익·배당수익과 베타 명예관의 칭호 기준을 확인할 수 있습니다.',
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
