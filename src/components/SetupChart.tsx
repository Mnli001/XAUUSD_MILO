import { MN_VIEWER, type Viewer } from "@/lib/viewer";

type Bar = { time: string; open: number; high: number; low: number; close: number };
type Props = { candles: Bar[]; side: "BUY" | "SELL" | null; entry: number | null; stop: number | null; target: number | null; band: { high: number; low: number } | null; v?: Viewer };

const W = 640, H = 240, PAD = 8;
// Theme colours, so the drawing follows dark and light.
const GOLD = "var(--color-amber-400)", UP = "var(--color-emerald-500)", DOWN = "var(--color-red-500)";
const px = (v: number) => v.toFixed(2);

/** Recent 15-minute candles with the setup drawn on them: entry, stop, target and the range it came from. */
export function SetupChart({ candles, side, entry, stop, target, band, v = MN_VIEWER }: Props) {
  const { t } = v;
  const when = (iso: string) => v.dateTime(new Date(iso)).slice(5);
  if (candles.length === 0) return <div className="flex h-56 items-center justify-center rounded-xl border border-zinc-800 text-sm text-zinc-500">{t("Лааны дата алга", "No candle data")}</div>;
  const lines = ([[t("Орох", "Entry"), entry, GOLD, "0"], ["Stop", stop, DOWN, "6 4"], ["Target", target, UP, "6 4"]] as [string, number | null, string, string][]).filter((l): l is [string, number, string, string] => l[1] !== null);
  const values = [...candles.flatMap((c) => [c.high, c.low]), ...lines.map((l) => l[1]), ...(band ? [band.high, band.low] : [])];
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const y = (price: number) => PAD + (1 - (price - min) / span) * (H - 2 * PAD);
  const step = W / candles.length;
  const label = side && entry !== null && stop !== null && target !== null
    ? t(`${side} setup: орох ${px(entry)}, stop ${px(stop)}, target ${px(target)}`, `${side} setup: entry ${px(entry)}, stop ${px(stop)}, target ${px(target)}`)
    : t(`Сүүлийн ${candles.length} лаа, хаалт ${px(candles.at(-1)!.close)}`, `Last ${candles.length} candles, close ${px(candles.at(-1)!.close)}`);
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
        {lines.map(([name, price, color, dash]) => <line key={name} x1="0" x2={W} y1={y(price)} y2={y(price)} stroke={color} strokeWidth="1.5" strokeDasharray={dash} vectorEffect="non-scaling-stroke" />)}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
        {lines.map(([name, price, color]) => (
          <span key={name} className="inline-flex items-center gap-1.5 whitespace-nowrap"><span aria-hidden className="h-0.5 w-4" style={{ background: color }} /><span>{name}</span><span className="font-mono text-zinc-200">{px(price)}</span></span>
        ))}
        {band && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span aria-hidden className="h-2.5 w-4 rounded-sm" style={{ background: GOLD, opacity: 0.3 }} /><span>{t("Азийн хүрээ", "Asian range")}</span><span className="font-mono text-zinc-200">{px(band.low)}–{px(band.high)}</span></span>}
        <span className="ml-auto font-mono whitespace-nowrap text-zinc-500">{when(candles[0].time)} → {when(candles.at(-1)!.time)} {v.zone}</span>
      </figcaption>
    </figure>
  );
}
