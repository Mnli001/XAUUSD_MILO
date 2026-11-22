type Bar = { time: string; open: number; high: number; low: number; close: number };
type Props = { candles: Bar[]; side: "BUY" | "SELL" | null; entry: number | null; stop: number | null; target: number | null; band: { high: number; low: number } | null };

const W = 640, H = 240, PAD = 8;
const GOLD = "#e3b44b", UP = "#2ea878", DOWN = "#d44b3f";
const px = (v: number) => v.toFixed(2);
const ubLabel = (iso: string) => new Date(new Date(iso).getTime() + 8 * 36e5).toISOString().slice(5, 16).replace("T", " ");

/** Recent 15-minute candles with the setup drawn on them: entry, stop, target and the range it came from. */
export function SetupChart({ candles, side, entry, stop, target, band }: Props) {
  if (candles.length === 0) return <div className="flex h-56 items-center justify-center rounded-xl border border-zinc-800 text-sm text-zinc-500">Лааны дата алга</div>;
  const lines = ([["Орох", entry, GOLD], ["Stop", stop, DOWN], ["Target", target, UP]] as [string, number | null, string][]).filter((l): l is [string, number, string] => l[1] !== null);
  const values = [...candles.flatMap((c) => [c.high, c.low]), ...lines.map((l) => l[1]), ...(band ? [band.high, band.low] : [])];
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);
  const step = W / candles.length;
  const label = side && entry !== null && stop !== null && target !== null
    ? `${side} setup: орох ${px(entry)}, stop ${px(stop)}, target ${px(target)}`
    : `Сүүлийн ${candles.length} лаа, хаалт ${px(candles.at(-1)!.close)}`;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className="h-56 w-full rounded-xl border border-zinc-800 bg-zinc-950 sm:h-64">
        {band && <rect x="0" width={W} y={y(band.high)} height={Math.max(y(band.low) - y(band.high), 1)} fill={GOLD} opacity="0.1" />}
        {candles.map((c, i) => {
          const x = i * step + step / 2;
          const color = c.close >= c.open ? UP : DOWN;
          const top = y(Math.max(c.open, c.close));
          return (
            <g key={c.time} data-candle>
              <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <rect x={x - step * 0.32} width={step * 0.64} y={top} height={Math.max(y(Math.min(c.open, c.close)) - top, 0.8)} fill={color} />
            </g>
          );
        })}
        {lines.map(([name, v, color]) => <line key={name} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke={color} strokeWidth="1.5" strokeDasharray={name === "Орох" ? "0" : "6 4"} vectorEffect="non-scaling-stroke" />)}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
        {lines.map(([name, v, color]) => (
          <span key={name} className="inline-flex items-center gap-1.5 whitespace-nowrap"><span aria-hidden className="h-0.5 w-4" style={{ background: color }} /><span>{name}</span><span className="font-mono text-zinc-200">{px(v)}</span></span>
        ))}
        {band && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span aria-hidden className="h-2.5 w-4 rounded-sm" style={{ background: GOLD, opacity: 0.3 }} /><span>Азийн хүрээ</span><span className="font-mono text-zinc-200">{px(band.low)}–{px(band.high)}</span></span>}
        <span className="ml-auto font-mono whitespace-nowrap text-zinc-500">{ubLabel(candles[0].time)} → {ubLabel(candles.at(-1)!.time)} УБ</span>
      </figcaption>
    </figure>
  );
}
