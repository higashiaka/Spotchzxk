import { MegaphonePost } from '../../hooks/useMegaphone';

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

interface MegaphonePostListProps {
  posts: MegaphonePost[];
  compact?: boolean;
  limit?: number;
}

export function MegaphonePostList({ posts, compact = false, limit }: MegaphonePostListProps) {
  const visiblePosts = typeof limit === 'number' ? posts.slice(0, limit) : posts;

  if (visiblePosts.length === 0) {
    return (
      <p className="text-sm text-center py-10" style={{ color: 'var(--text-dim)' }}>
        아직 확성기 사용 기록이 없습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {visiblePosts.map(post => (
        <a
          key={post.id}
          href={post.liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-3 rounded-xl transition-all hover:brightness-110 ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}
          style={{ background: 'var(--bg-sidebar)', border: '1px solid #222A3A', textDecoration: 'none' }}
        >
          <span className={`${compact ? 'text-lg' : 'text-xl'} shrink-0`}>📣</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-bold truncate" style={{ color: 'var(--text-secondary)' }}>
                {post.streamerName}
              </span>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                style={{ background: '#FF4444', color: '#FFF' }}
              >
                LIVE
              </span>
            </div>
            {post.message && (
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {post.message}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{formatTime(post.createdAt)}</p>
            <p className="text-[10px]" style={{ color: '#00AAFF' }}>링크 보기 →</p>
          </div>
        </a>
      ))}
    </div>
  );
}
