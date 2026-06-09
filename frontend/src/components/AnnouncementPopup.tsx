import { useEffect, useMemo, useState } from 'react';
import { latestAnnouncement, type AnnouncementItem } from './announcements/announcementData';
import { apiFetch } from '../lib/api';
import { subscribeStomp } from '../lib/stompClient';

interface StockSplitNotice {
  id: string;
  splitDate: string;
  thresholdPrice: number;
  splitRatio: number;
  stockCount: number;
  stockNames: string;
  createdAt: string;
}

export default function AnnouncementPopup() {
  const [stockSplitNotice, setStockSplitNotice] = useState<StockSplitNotice | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    apiFetch('/api/announcements/stock-splits/latest')
      .then(res => (res.ok ? res.json() : null))
      .then((notice: StockSplitNotice | null) => {
        if (notice) setStockSplitNotice(notice);
      })
      .catch(() => {});

    const subscription = subscribeStomp('/topic/stock-split-notices', message => {
      try {
        setStockSplitNotice(JSON.parse(message.body) as StockSplitNotice);
      } catch {
        /* ignore malformed messages */
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const stockSplitAnnouncement = useMemo<AnnouncementItem | null>(() => {
    if (!stockSplitNotice) return null;

    const stockNames = stockSplitNotice.stockNames
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)
      .join(', ');

    return {
      id: `stock_split_${stockSplitNotice.id}`,
      title: '액면분할 안내',
      date: stockSplitNotice.splitDate,
      summary: `${stockSplitNotice.stockCount}개 종목이 ${stockSplitNotice.splitRatio}:1 액면분할되었습니다.`,
      sections: [
        {
          title: '분할 종목',
          rows: [
            {
              label: '기준',
              value: `${stockSplitNotice.thresholdPrice.toLocaleString()}원 초과`,
              tone: 'accent' as const,
            },
            {
              label: '비율',
              value: `${stockSplitNotice.splitRatio}:1`,
              tone: 'accent' as const,
            },
            {
              label: '종목',
              value: stockNames || '-',
              tone: 'accent' as const,
            },
          ],
          note: '보유 수량과 미체결 지정가 주문 수량/가격이 같은 비율로 조정되었습니다.',
        },
      ],
    };
  }, [stockSplitNotice]);

  const activeAnnouncement = useMemo(() => {
    const candidates = stockSplitAnnouncement ? [stockSplitAnnouncement, latestAnnouncement] : [latestAnnouncement];

    return candidates.find(announcement => localStorage.getItem(announcement.id) !== 'hidden') ?? null;
  }, [stockSplitAnnouncement]);

  if (!visible || !activeAnnouncement) return null;

  const noticeKey = activeAnnouncement.id;
  const dismiss = (permanent: boolean) => {
    if (permanent) localStorage.setItem(noticeKey, 'hidden');
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4 modal-panel"
      >
        <button
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
          onClick={() => dismiss(false)}
        >
          X
        </button>

        <div className="flex items-center gap-2">
          <span className="text-accent text-xl">$</span>
          <span className="font-bold text-white text-base">{activeAnnouncement.title}</span>
        </div>

        <div className="text-sm leading-relaxed text-secondary-token flex flex-col gap-3">
          {activeAnnouncement.sections.map(section => (
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

        <div className="flex flex-col gap-2 mt-1">
          <button
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80 accent-button"
            onClick={() => dismiss(false)}
          >
            확인
          </button>
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
