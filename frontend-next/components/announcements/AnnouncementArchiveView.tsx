import { useState } from 'react';
import { announcements } from './announcementData';

export const AnnouncementArchiveView = ({ onBack }: { onBack: () => void }) => {
  const [index, setIndex] = useState(0);
  const active = announcements[index];
  const hasPrevious = index > 0;
  const hasNext = index < announcements.length - 1;

  const move = (direction: -1 | 1) => {
    setIndex(current => Math.min(announcements.length - 1, Math.max(0, current + direction)));
  };

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div
        className="flex items-center gap-3 px-4 md:px-6 py-4 shrink-0"
        style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-primary)' }}
      >
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
          <h2 className="text-xl md:text-2xl font-black text-white">지난 공지</h2>
          <p className="text-xs md:text-sm mt-0.5" style={{ color: 'var(--text-dim)' }}>
            이전 업데이트 내용을 카드로 다시 확인합니다
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 hide-scrollbar touch-pan-y">
        <div className="max-w-2xl mx-auto">
          <div
            className="rounded-xl border p-5 md:p-6 min-h-[430px] flex flex-col"
            style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="min-w-0">
                <p className="text-xs font-bold mb-1" style={{ color: 'var(--accent)' }}>
                  {active.date}
                </p>
                <h3 className="text-xl md:text-2xl font-black text-white">{active.title}</h3>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                  {active.summary}
                </p>
              </div>
              <span className="text-xs font-bold shrink-0" style={{ color: 'var(--text-muted)' }}>
                {index + 1} / {announcements.length}
              </span>
            </div>

            <div className="space-y-3 flex-1">
              {active.sections.map(section => (
                <section
                  key={section.title}
                  className="rounded-xl border p-3.5"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
                >
                  <p className="text-sm font-bold text-white mb-2">{section.title}</p>
                  {section.rows?.map(row => (
                    <p key={`${active.id}-${section.title}-${row.label}`} className="text-sm mb-1 last:mb-0">
                      <span style={{ color: row.tone === 'danger' ? '#FF6B6B' : 'var(--accent)' }}>{row.label}</span>
                      <span className="ml-2 text-white">{row.value}</span>
                    </p>
                  ))}
                  {section.table && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-xs md:text-sm">
                        <thead>
                          <tr>
                            {section.table.headers.map(header => (
                              <th
                                key={`${active.id}-${section.title}-${header}`}
                                className="py-1.5 pr-3 text-left font-bold"
                                style={{ color: 'var(--accent)', borderBottom: '1px solid var(--border-card)' }}
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.table.rows.map((row, rowIndex) => (
                            <tr key={`${active.id}-${section.title}-${rowIndex}`}>
                              {row.map((cell, cellIndex) => (
                                <td
                                  key={`${active.id}-${section.title}-${rowIndex}-${cellIndex}`}
                                  className="py-1.5 pr-3 text-white"
                                  style={{ borderBottom: '1px solid var(--border-card)' }}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {section.note && (
                    <p className="text-xs mt-1.5" style={{ color: 'var(--text-dim)' }}>
                      {section.note}
                    </p>
                  )}
                </section>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mt-4">
            <button
              type="button"
              onClick={() => move(-1)}
              disabled={!hasPrevious}
              className="h-10 px-4 rounded-xl border text-sm font-bold disabled:opacity-35 transition-opacity"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            >
              이전
            </button>
            <div className="flex items-center justify-center gap-2">
              {announcements.map((notice, dotIndex) => (
                <button
                  key={notice.id}
                  type="button"
                  onClick={() => setIndex(dotIndex)}
                  className="w-2.5 h-2.5 rounded-full transition-all"
                  style={{
                    background: dotIndex === index ? 'var(--accent)' : 'var(--border-primary)',
                    transform: dotIndex === index ? 'scale(1.2)' : 'scale(1)',
                  }}
                  aria-label={`${dotIndex + 1}번째 공지 보기`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => move(1)}
              disabled={!hasNext}
              className="h-10 px-4 rounded-xl border text-sm font-bold disabled:opacity-35 transition-opacity"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            >
              다음
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
