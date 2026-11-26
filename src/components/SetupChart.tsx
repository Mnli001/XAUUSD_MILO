import { sessionLabel, sessionOfUbHour, ubHour } from "@/lib/time";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";
import { SESSIONS, sessionColor } from "./SessionLine";

type Bar = { time: string; open: number; high: number; low: number; close: number };
type Props = { candles: Bar[]; side: "BUY" | "SELL" | null; entry: number | null; stop: number | null; target: number | null; band: { high: number; low: number } | null; v?: Viewer };

const W = 640, H = 240, PAD = 8, STRIP = 5, PLOT = H - STRIP - 2 * PAD - 4;
/** Room on the right for the price scale (viewBox units; the labels themselves are HTML so they never stretch). */
const GUT = 78;
// Theme colours, so the drawing follows dark and light.
const GOLD = "var(--color-amber-400)", UP = "var(--color-emerald-500)", DOWN = "var(--color-red-500)";
const px = (v: number) => v.toFixed(2);

/** Recent 15-minute candles with the setup drawn on them: entry, stop, target and the range it came from. */
export function SetupChart({ candles, side, entry, stop, target, band, v = MN_VIEWER }: Props) {
  const { t } = v;
  const when = (iso: string) => v.dateTime(new Date(iso)).slice(5);
  if (candles.length === 0) return <div className="flex h-56 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-sm text-zinc-500">{t("Лааны дата алга", "No candle data")}</div>;
  const lines = ([[t("Орох", "Entry"), entry, GOLD, "0"], ["Stop", stop, DOWN, "6 4"], ["Target", target, UP, "6 4"]] as [string, number | null, string, string][]).filter((l): l is [string, number, string, string] => l[1] !== null);
  const values = [...candles.flatMap((c) => [c.high, c.low]), ...lines.map((l) => l[1]), ...(band ? [band.high, band.low] : [])];
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const y = (price: number) => PAD + (1 - (price - min) / span) * PLOT;
  const step = (W - GUT) / candles.length;
  const last = candles.at(-1)!.close;
  // About four round prices for the scale.
  const raw = span / 4, mag = 10 ** Math.floor(Math.log10(raw)), gridStep = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((g) => g >= raw) ?? raw;
  const grid: number[] = [];
  for (let p = Math.ceil(min / gridStep) * gridStep; p <= max; p += gridStep) grid.push(p);
  const pct = (price: number) => `${(y(price) / H) * 100}%`;
  // The session each candle belongs to, merged into runs: the metro line the price travelled on.
  const runs: { session: string; from: number; to: number }[] = [];
  candles.forEach((c, i) => {
    const s = sessionOfUbHour(ubHour(new Date(c.time)));
    const last = runs.at(-1);
    if (last && last.session === s) last.to = i + 1;
    else runs.push({ session: s, from: i, to: i + 1 });
  });
  const label = side && entry !== null && stop !== null && target !== null
    ? t(`${side} setup: орох ${px(entry)}, stop ${px(stop)}, target ${px(target)}`, `${side} setup: entry ${px(entry)}, stop ${px(stop)}, target ${px(target)}`)
    : t(`Сүүлийн ${candles.length} лаа, хаалт ${px(candles.at(-1)!.close)}`, `Last ${candles.length} candles, close ${px(candles.at(-1)!.close)}`);
  return (
    <figure className="m-0">
      <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className="h-56 w-full rounded-lg border border-zinc-800 bg-zinc-950 sm:h-64">
        {grid.map((g) => <line key={g} x1="0" x2={W - GUT} y1={y(g)} y2={y(g)} stroke="var(--color-zinc-800)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {band && <rect x="0" width={W - GUT} y={y(band.high)} height={Math.max(y(band.low) - y(band.high), 1)} fill={GOLD} opacity="0.1" />}
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
        {lines.map(([name, price, color, dash]) => <line key={name} x1="0" x2={W - GUT} y1={y(price)} y2={y(price)} stroke={color} strokeWidth={dash === "0" ? 2 : 1.5} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />)}
        <line x1="0" x2={W - GUT} y1={y(last)} y2={y(last)} stroke="var(--color-zinc-300)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        {runs.map((r) => <rect key={r.from} x={r.from * step + 1} width={Math.max((r.to - r.from) * step - 2, 1)} y={H - STRIP - 3} height={STRIP} rx={2.5} fill={sessionColor(r.session)} />)}
      </svg>
      {/* The price scale and tags, in HTML so the text keeps its shape however the chart is stretched. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-[12.2%] text-[10px] tabular-nums sm:text-[11px]">
        {grid.map((g) => <span key={g} className="absolute right-1 -translate-y-1/2 text-zinc-500" style={{ top: pct(g) }}>{px(g)}</span>)}
        {lines.map(([name, price, color]) => <span key={name} className="absolute right-0.5 -translate-y-1/2 rounded px-1 font-semibold text-zinc-950" style={{ top: pct(price), background: color }}>{px(price)}</span>)}
        <span className="absolute right-0.5 -translate-y-1/2 rounded bg-zinc-200 px-1 font-semibold text-zinc-950" style={{ top: pct(last) }}>{px(last)}</span>
      </div>
      </div>
      <figcaption className="mt-2.5 space-y-1.5 text-xs text-zinc-400">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {lines.map(([name, price, color, dash]) => (
            <span key={name} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {dash === "0" ? <span aria-hidden className="h-[5px] w-4 rounded-full" style={{ background: color }} /> : <span aria-hidden className="w-4 border-t-2 border-dashed" style={{ borderColor: color }} />}
              <span>{name}</span><span className="font-medium text-zinc-200 tabular-nums">{px(price)}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span aria-hidden className="w-4 border-t border-dotted border-zinc-300" /><span>{t("Одоогийн үнэ", "Price now")}</span><span className="font-medium text-zinc-200 tabular-nums">{px(last)}</span></span>
          {band && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span aria-hidden className="h-2.5 w-4 rounded-sm" style={{ background: GOLD, opacity: 0.3 }} /><span>{t("Азийн хүрээ", "Asian range")}</span><span className="font-medium text-zinc-200 tabular-nums">{px(band.low)}–{px(band.high)}</span></span>}
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-500">
          {SESSIONS.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5 whitespace-nowrap"><span aria-hidden className="h-[5px] w-4 rounded-full" style={{ background: s.color }} />{sessionLabel(s.key, t)}</span>)}
          <span className="whitespace-nowrap tabular-nums sm:ml-auto">{when(candles[0].time)} → {when(candles.at(-1)!.time)} {v.zone}</span>
        </span>
      </figcaption>
    </figure>
  );
}
