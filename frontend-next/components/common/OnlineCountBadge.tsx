export const OnlineCountBadge = ({
  count,
  compact = false,
}: {
  count: number | null;
  compact?: boolean;
}) => {
  const displayCount = count ?? 0;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border online-count-badge ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}
      title="현재 접속자 수"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping bg-accent" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
      <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-bold whitespace-nowrap`}>
        동접 {displayCount.toLocaleString()}명
      </span>
    </div>
  );
};
