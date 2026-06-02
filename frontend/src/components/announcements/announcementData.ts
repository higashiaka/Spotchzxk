export interface AnnouncementItem {
  id: string;
  title: string;
  date: string;
  summary: string;
  sections: {
    title: string;
    rows: { label: string; value: string; tone?: 'accent' | 'danger' }[];
    note?: string;
  }[];
}

export const announcements: AnnouncementItem[] = [
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
          { label: '변경 후', value: '3,000만 코인', tone: 'accent' },
          { label: '기존', value: '10억 코인', tone: 'danger' },
        ],
      },
      {
        title: '종목 추가 티켓 가격 인하',
        rows: [
          { label: '변경 후', value: '1,000만 코인', tone: 'accent' },
          { label: '기존', value: '3,000만 코인', tone: 'danger' },
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
        rows: [{ label: '비용', value: '1,000,000 코인', tone: 'accent' }],
        note: '프로필 화면에서 이름 옆 편집 버튼으로 변경',
      },
      {
        title: '종목 추가 티켓 출시',
        rows: [{ label: '비용', value: '30,000,000 코인', tone: 'accent' }],
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
