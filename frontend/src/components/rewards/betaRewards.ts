export type BetaTitleTone = 'gold' | 'blue' | 'green' | 'red' | 'gray';

export interface UserTitle {
  id: string | number;
  label: string;
  description?: string;
  tone?: BetaTitleTone;
  awardedAt?: string;
}

export interface BetaRewardTier {
  id: string;
  label: string;
  description: string;
  tone: BetaTitleTone;
  status: 'earned' | 'pending' | 'locked';
}

export const betaRewardTiers: BetaRewardTier[] = [
  {
    id: 'beta-founder',
    label: '베타 개척자',
    description: '베타 시즌에 Google 계정으로 참여한 유저',
    tone: 'gold',
    status: 'pending',
  },
  {
    id: 'beta-top-realized',
    label: '베타 수익왕',
    description: '베타 시즌 실현손익 상위권',
    tone: 'green',
    status: 'locked',
  },
  {
    id: 'beta-tier',
    label: '베타 티어',
    description: '베타 시즌 종료 시점의 최종 티어 기준 칭호',
    tone: 'gold',
    status: 'locked',
  },
  {
    id: 'beta-top-dividend',
    label: '베타 배당왕',
    description: '베타 시즌 배당수익 상위권',
    tone: 'blue',
    status: 'locked',
  },
  {
    id: 'beta-top-donation',
    label: '베타 대표 팬',
    description: '베타 시즌 종목별 후원 랭킹 상위권',
    tone: 'red',
    status: 'locked',
  },
];

export const betaTitleToneStyle = (tone: BetaTitleTone = 'gray') => {
  switch (tone) {
    case 'gold':
      return { background: '#FFB02022', color: '#FFD166', borderColor: '#FFB02066' };
    case 'blue':
      return { background: '#3D8BFF22', color: '#7BAAF7', borderColor: '#3D8BFF66' };
    case 'green':
      return { background: '#00D08422', color: '#39D98A', borderColor: '#00D08466' };
    case 'red':
      return { background: '#FF525222', color: '#FF8A80', borderColor: '#FF525266' };
    default:
      return { background: 'var(--bg-card)', color: 'var(--text-dim)', borderColor: 'var(--border-primary)' };
  }
};

export const defaultBetaTitle: UserTitle = {
  id: 'beta-founder',
  label: '베타 개척자',
  description: '정식 전환 시 베타 참여 스냅샷 기준으로 지급 예정',
  tone: 'gold',
};
