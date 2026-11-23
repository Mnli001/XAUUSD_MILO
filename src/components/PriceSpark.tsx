/**
 * The last day of gold as one gold line: an area chart drawn from the stored 15-minute closes.
 * Decorative beside the figures it sits with; the high and low are also printed.
 */
export function PriceSpark({ closes, className = "" }: { closes: number[]; className?: string }) {
  if (closes.length < 8) return null;
  const W = 600, H = 160, pad = 10;
  const min = Math.min(...closes), max = Math.max(...closes), span = max - min || 1;
  const x = (i: number) => (i / (closes.length - 1)) * W;
  const y = (c: number) => pad + (1 - (c - min) / span) * (H - pad * 2);
  // A smooth line: each segment bends through the midpoints of its neighbours.
  let line = `M${x(0)} ${y(closes[0])}`;
  for (let i = 1; i < closes.length; i++) {
    const mx = (x(i - 1) + x(i)) / 2;
    line += ` C${mx} ${y(closes[i - 1])} ${mx} ${y(closes[i])} ${x(i)} ${y(closes[i])}`;
  }
  const lastY = (y(closes[closes.length - 1]) / H) * 100;
  return (
    <div aria-hidden className={`relative ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="draw-line h-full w-full overflow-visible">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-amber-400)" stopOpacity="0.32" />
            <stop offset="1" stopColor="var(--color-amber-400)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="spark-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--color-amber-500)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--color-amber-300)" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#spark-fill)" />
        <path d={line} fill="none" stroke="url(#spark-line)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="now-pulse absolute right-0 h-2.5 w-2.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300" style={{ top: `${lastY}%` }} />
    </div>
  );
}
