import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import type { Stock } from '../../hooks/useStocks';

const categories = [
  ['BUG', '오류 신고'], ['SUGGESTION', '기능 건의'], ['ACCOUNT', '계정·거래 문의'],
  ['STOCK', '종목 문의'], ['REPORT', '신고'], ['OTHER', '기타'],
] as const;
const categoryLabel = Object.fromEntries(categories);

type FeedbackItem = {
  id: string;
  category: string;
  title: string;
  content: string;
  stockName?: string | null;
  status: 'RECEIVED' | 'ANSWERED';
  replies?: { id: number; content: string; createdAt: string }[];
  answer?: string | null;
  answeredAt?: string | null;
  createdAt: string;
};

export function FeedbackView({ onBack, stocks }: { onBack: () => void; stocks: Stock[] }) {
  const [tab, setTab] = useState<'write' | 'history'>('write');
  const [category, setCategory] = useState('BUG');
  const [stockId, setStockId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receiptId, setReceiptId] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [openId, setOpenId] = useState('');

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await apiFetch('/api/feedback');
      if (!response.ok) throw new Error();
      setItems(await response.json());
    } catch {
      setError('문의 내역을 불러오지 못했습니다.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !content.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await apiFetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ category, title: title.trim(), content: content.trim(), stockId: stockId || null, pageUrl: window.location.href }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || '문의 접수에 실패했습니다.');
      setReceiptId(String(body.id));
      setTitle(''); setContent(''); setStockId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '문의 접수에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldStyle = { background: 'var(--bg-card)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-24 hide-scrollbar touch-pan-y">
      <div className="flex items-center gap-3 mb-5">
        <button type="button" onClick={onBack} className="md:hidden w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
          style={fieldStyle} aria-label="뒤로 가기">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h2 className="text-xl md:text-2xl font-black text-white">문의 및 건의</h2>
          <p className="text-xs md:text-sm mt-0.5" style={{ color: 'var(--text-dim)' }}>문의 접수와 운영자 답변을 한곳에서 확인할 수 있습니다.</p>
        </div>
      </div>

      <div className="max-w-2xl flex gap-2 mb-4">
        {([['write', '문의 작성'], ['history', '내 문의 내역']] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => { setTab(value); setError(''); }}
            className="flex-1 rounded-xl border px-4 py-3 text-sm font-black"
            style={{ background: tab === value ? 'var(--accent-soft)' : 'var(--bg-card)', borderColor: tab === value ? 'var(--accent-border)' : 'var(--border-primary)', color: tab === value ? 'var(--accent)' : 'var(--text-dim)' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'write' ? (
        <form onSubmit={submit} className="max-w-2xl rounded-xl border p-4 md:p-6 space-y-5"
          style={{ background: 'var(--bg-card-secondary)', borderColor: 'var(--border-primary)' }}>
          <label className="block"><span className="block text-sm font-bold mb-2 text-white">문의 유형</span>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-xl border px-3 py-3 outline-none" style={fieldStyle}>
              {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block"><span className="block text-sm font-bold mb-2 text-white">관련 종목 <span className="font-normal" style={{ color: 'var(--text-dim)' }}>(선택)</span></span>
            <select value={stockId} onChange={e => setStockId(e.target.value)} className="w-full rounded-xl border px-3 py-3 outline-none" style={fieldStyle}>
              <option value="">관련 종목 없음</option>
              {[...stocks].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(stock => <option key={stock.id} value={stock.id}>{stock.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="block text-sm font-bold mb-2 text-white">제목</span>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} required placeholder="문의 내용을 짧게 요약해 주세요"
              className="w-full rounded-xl border px-3 py-3 outline-none" style={fieldStyle} />
          </label>
          <label className="block"><span className="block text-sm font-bold mb-2 text-white">내용</span>
            <textarea value={content} onChange={e => setContent(e.target.value)} maxLength={3000} required rows={9}
              placeholder="발생 상황과 재현 방법을 자세히 적어주세요." className="w-full rounded-xl border px-3 py-3 outline-none resize-y" style={fieldStyle} />
            <span className="block text-right text-xs mt-1" style={{ color: 'var(--text-dim)' }}>{content.length}/3000</span>
          </label>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>비밀번호, 인증 토큰, 이메일 등 민감한 개인정보는 입력하지 마세요.</p>
          {error && <p className="text-sm font-bold text-red-400">{error}</p>}
          {receiptId && <div className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--accent-border)', color: 'var(--accent)' }}>접수되었습니다. 접수번호: <span className="font-mono font-bold">{receiptId}</span></div>}
          <button type="submit" disabled={submitting || !title.trim() || !content.trim()} className="w-full rounded-xl px-4 py-3 font-black text-sm disabled:opacity-50" style={{ background: 'var(--accent)', color: '#07120c' }}>
            {submitting ? '접수 중…' : '문의 접수하기'}
          </button>
        </form>
      ) : (
        <div className="max-w-2xl space-y-3">
          {historyLoading && <p className="text-sm text-center py-8" style={{ color: 'var(--text-dim)' }}>문의 내역을 불러오는 중…</p>}
          {!historyLoading && items.length === 0 && <p className="text-sm text-center py-8" style={{ color: 'var(--text-dim)' }}>접수한 문의가 없습니다.</p>}
          {items.map(item => {
            const open = openId === item.id;
            const replies = item.replies?.length
              ? item.replies
              : item.answer
                ? [{ id: 0, content: item.answer, createdAt: item.answeredAt ?? item.createdAt }]
                : [];
            return (
              <button key={item.id} type="button" onClick={() => setOpenId(open ? '' : item.id)}
                className="w-full text-left rounded-xl border p-4" style={{ background: 'var(--bg-card-secondary)', borderColor: item.status === 'ANSWERED' ? 'var(--accent-border)' : 'var(--border-primary)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="text-sm font-black text-white truncate">{item.title}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>{categoryLabel[item.category] ?? item.category}{item.stockName ? ` · ${item.stockName}` : ''} · {new Date(item.createdAt).toLocaleString('ko-KR')}</p>
                  </div>
                  <span className="text-xs font-bold shrink-0" style={{ color: item.status === 'ANSWERED' ? 'var(--accent)' : 'var(--text-dim)' }}>{item.status === 'ANSWERED' ? '답변 완료' : '접수됨'}</span>
                </div>
                {open && <div className="mt-4 pt-4 text-sm leading-relaxed" style={{ borderTop: '1px solid var(--border-primary)' }}>
                  <p className="whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{item.content}</p>
                  {replies.length ? <div className="mt-4 space-y-3">
                    {replies.map((reply, index) => (
                      <div key={reply.id} className="rounded-xl p-4" style={{ background: 'var(--accent-soft)' }}>
                        <p className="text-xs font-black mb-2" style={{ color: 'var(--accent)' }}>
                          {index === 0 ? '운영자 답변' : `후속 답변 ${index}`}
                        </p>
                        <p className="whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{reply.content}</p>
                        <p className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>{new Date(reply.createdAt).toLocaleString('ko-KR')}</p>
                      </div>
                    ))}
                  </div> : <p className="mt-4 text-xs" style={{ color: 'var(--text-dim)' }}>아직 답변이 등록되지 않았습니다.</p>}
                </div>}
              </button>
            );
          })}
          {error && <p className="text-sm font-bold text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
