import { sessionLabel, sessionOfUbHour, ubHour } from "@/lib/time";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";
import { SESSIONS, sessionColor } from "./SessionLine";

type Bar = { time: string; open: number; high: number; low: number; close: number };
type Props = {
  candles: Bar[];
  side: "BUY" | "SELL" | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  band: { high: number; low: number } | null;
  /** WATCH: the move expected if the breakout comes. ACTIVE: the trade in play. Anything else: no arrow. */
  status?: "FORMING" | "WATCH" | "ACTIVE" | "OFF";
  /** When the trade's signal bar closed (ACTIVE), so its zones start there. */
  at?: string | null;
  v?: Viewer;
};

const GOLD = "var(--color-amber-400)", UP = "var(--color-emerald-500)", DOWN = "var(--color-red-500)", MUTED = "var(--color-zinc-500)";
const px = (v: number) => v.toFixed(2);

/**
 * Recent 15-minute candles with the setup drawn the way traders draw a position: the range it came from, entry,
 * stop and target, red and green zones, and an arrow for the move the rule expects, reaching into empty space on
 * the right that stands for the hours ahead. Drawn twice (a tall frame for phones, a wide one for larger screens)
 * so text and arrowheads keep their shape at any width.
 */
export function SetupChart({ candles, side, entry, stop, target, band, status = "OFF", at = null, v = MN_VIEWER }: Props) {
  const { t } = v;
  const when = (iso: string) => v.dateTime(new Date(iso)).slice(5);
  if (candles.length === 0) return <div className="flex h-56 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-500">{t("Лааны дата алга", "No candle data")}</div>;
  const last = candles.at(-1)!.close;
  const levels = side && entry !== null && stop !== null && target !== null ? { entry, stop, target } : null;
  const label = levels
    ? t(`${side} setup: орох ${px(levels.entry)}, stop ${px(levels.stop)}, target ${px(levels.target)}`, `${side} setup: entry ${px(levels.entry)}, stop ${px(levels.stop)}, target ${px(levels.target)}`)
    : t(`Сүүлийн ${candles.length} лаа, хаалт ${px(last)}`, `Last ${candles.length} candles, close ${px(last)}`);
  const showArrow = !!levels && (status === "WATCH" || status === "ACTIVE");
  const arrowText = side === "BUY" ? t("Таамаг: өсөх", "Expected: up") : t("Таамаг: унах", "Expected: down");

  function frame(W: number, H: number, main: boolean) {
    const PAD_T = 16, PAD_B = 30, GUT = W < 700 ? 74 : 86, FUT = showArrow ? Math.round((W - GUT) * (W < 700 ? 0.26 : 0.2)) : 0;
    const plotR = W - GUT, barsR = plotR - FUT, plotH = H - PAD_T - PAD_B;
    const values = [...candles.flatMap((c) => [c.high, c.low]), ...(levels ? [levels.entry, levels.stop, levels.target] : []), ...(band ? [band.high, band.low] : [])];
    const lo0 = Math.min(...values), hi0 = Math.max(...values), padP = (hi0 - lo0) * 0.06 || 1;
    const lo = lo0 - padP, hi = hi0 + padP;
    const y = (p: number) => PAD_T + ((hi - p) / (hi - lo)) * plotH;
    const step = barsR / candles.length, x = (i: number) => i * step + step / 2;
    const raw = (hi - lo) / 5, mag = 10 ** Math.floor(Math.log10(raw)), gs = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((g) => g >= raw) ?? raw;
    const grid: number[] = [];
    for (let p = Math.ceil(lo / gs) * gs; p <= hi; p += gs) grid.push(p);
    const runs: { session: string; from: number; to: number }[] = [];
    candles.forEach((c, i) => {
      const s = sessionOfUbHour(ubHour(new Date(c.time)));
      const r = runs.at(-1);
      if (r && r.session === s) r.to = i + 1; else runs.push({ session: s, from: i, to: i + 1 });
    });
    // The trade's zones start at its signal bar (ACTIVE) or at the last candle (WATCH), and run to the right edge.
    const sigIdx = status === "ACTIVE" && at ? Math.max(0, candles.findIndex((c) => new Date(c.time).getTime() + 15 * 6e4 >= new Date(at).getTime())) : candles.length - 1;
    const zx0 = status === "ACTIVE" ? x(sigIdx) : barsR, zx1 = plotR - 4;
    const bw = Math.max(1.2, step * 0.64);
    const fs = W < 700 ? 13 : 12;
    // Price tags on the right edge, nudged apart so two close prices never sit on top of each other.
    const tagList: [number, string, string, string][] = [
      ...(levels ? ([[levels.stop, "var(--color-red-500)", "#fff", "s"], [levels.target, "var(--color-emerald-500)", "#05140c", "t"], [levels.entry, "var(--color-amber-400)", "#1a1406", "e"]] as [number, string, string, string][]) : []),
      [last, "var(--color-zinc-200)", "#0b0b0b", "p"],
    ];
    const tagY = new Map<string, number>();
    {
      const sorted = tagList.map(([p, , , k]) => ({ k, y: Math.min(Math.max(y(p), PAD_T + 9), H - PAD_B - 9) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < sorted.length; i++) if (sorted[i].y - sorted[i - 1].y < 21) sorted[i].y = sorted[i - 1].y + 21;
      for (const t2 of sorted) tagY.set(t2.k, t2.y);
    }
    const tag = (p: number, fill: string, ink: string, key: string) => {
      const ty = tagY.get(key) ?? y(p);
      return (
        <g key={key}>
          <rect x={plotR + 4} y={ty - 10} width={GUT - 8} height={20} rx={4} fill={fill} />
          <text x={plotR + GUT / 2} y={ty + 4.5} textAnchor="middle" fontSize={fs} fontWeight={700} fill={ink}>{px(p)}</text>
        </g>
      );
    };
    // The arrow: from the price now, through the breakout level (WATCH), to the target.
    let arrow: { d: string; hx: number; hy: number; ang: number; lx: number; ly: number } | null = null;
    if (showArrow && levels) {
      const pts: [number, number][] = status === "WATCH"
        ? [[x(candles.length - 1), y(last)], [barsR + FUT * 0.35, y(levels.entry)], [zx1 - 14, y(levels.target)]]
        : [[x(candles.length - 1), y(last)], [zx1 - 14, y(levels.target)]];
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      // the label sits beside the middle of the last leg, on the side away from the move
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      arrow = { d: pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "), hx: b[0], hy: b[1], ang: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI, lx: mx - 12, ly: my + (side === "BUY" ? 4 : 4) };
    }
    const dirColor = side === "BUY" ? UP : DOWN;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} role={main ? "img" : undefined} aria-label={main ? label : undefined} aria-hidden={main ? undefined : true}
        className={`${main ? "hidden sm:block" : "sm:hidden"} h-auto w-full rounded-xl border border-zinc-800 bg-zinc-950`}>
        {grid.map((g) => (
          <g key={g}>
            <line x1={0} x2={plotR} y1={y(g)} y2={y(g)} stroke="var(--color-zinc-800)" strokeWidth={1} />
            <text x={plotR + 8} y={y(g) + 4} fontSize={fs - 1} fill={MUTED}>{px(g)}</text>
          </g>
        ))}
        {FUT > 0 && <rect x={barsR} y={PAD_T} width={FUT} height={plotH} fill="var(--color-zinc-900)" opacity={0.55} />}
        {FUT > 0 && <text x={barsR + FUT / 2} y={H - PAD_B - 6} textAnchor="middle" fontSize={fs - 2} fill={MUTED}>{t("дараагийн цагууд", "hours ahead")}</text>}
        {band && <rect x={0} width={barsR} y={y(band.high)} height={Math.max(y(band.low) - y(band.high), 1)} fill={GOLD} opacity={0.08} />}
        {levels && showArrow && (
          <g>
            <rect x={zx0} width={zx1 - zx0} y={Math.min(y(levels.entry), y(levels.stop))} height={Math.abs(y(levels.stop) - y(levels.entry))} fill={DOWN} opacity={0.16} />
            <rect x={zx0} width={zx1 - zx0} y={Math.min(y(levels.entry), y(levels.target))} height={Math.abs(y(levels.target) - y(levels.entry))} fill={UP} opacity={0.14} />
          </g>
        )}
        {candles.map((c, i) => {
          const color = c.close >= c.open ? UP : DOWN, top = y(Math.max(c.open, c.close));
          return (
            <g key={c.time} data-candle={main ? "" : undefined}>
              <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth={1} />
              <rect x={x(i) - bw / 2} width={bw} y={top} height={Math.max(y(Math.min(c.open, c.close)) - top, 0.8)} fill={color} />
            </g>
          );
        })}
        {levels && (
          <g>
            <line x1={0} x2={plotR} y1={y(levels.entry)} y2={y(levels.entry)} stroke={GOLD} strokeWidth={1.6} strokeDasharray="7 4" />
            <line x1={showArrow ? zx0 : 0} x2={plotR} y1={y(levels.stop)} y2={y(levels.stop)} stroke={DOWN} strokeWidth={1.3} />
            <line x1={showArrow ? zx0 : 0} x2={plotR} y1={y(levels.target)} y2={y(levels.target)} stroke={UP} strokeWidth={1.3} />
          </g>
        )}
        <line x1={0} x2={plotR} y1={y(last)} y2={y(last)} stroke="var(--color-zinc-400)" strokeWidth={1} strokeDasharray="2 4" />
        {arrow && (
          <g data-arrow={main ? "" : undefined}>
            <path d={arrow.d} fill="none" stroke={dirColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={status === "WATCH" ? "9 6" : undefined} />
            <polygon points="0,0 -16,-8 -16,8" fill={dirColor} transform={`translate(${arrow.hx.toFixed(1)} ${arrow.hy.toFixed(1)}) rotate(${arrow.ang.toFixed(1)})`} />
            <text x={arrow.lx} y={arrow.ly} textAnchor="end" fontSize={fs} fontWeight={700} fill={dirColor} stroke="var(--color-zinc-950, #09090b)" strokeWidth={4} paintOrder="stroke">{arrowText}</text>
          </g>
        )}
        {tagList.map(([p, fill, ink, k]) => tag(p, fill, ink, k))}
        {runs.map((r) => <rect key={r.from} x={r.from * step + 1} width={Math.max((r.to - r.from) * step - 2, 1)} y={H - PAD_B + 10} height={5} rx={2.5} fill={sessionColor(r.session)} />)}
        <text x={2} y={H - 4} fontSize={fs - 2} fill={MUTED}>{when(candles[0].time)}</text>
        <text x={barsR} y={H - 4} textAnchor="end" fontSize={fs - 2} fill={MUTED}>{when(candles.at(-1)!.time)}</text>
      </svg>
    );
  }

  return (
    <figure className="m-0">
      {frame(1000, 430, true)}
      {frame(600, 520, false)}
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-400">
        {levels && ([[t("Орох", "Entry"), levels.entry, GOLD], ["Stop", levels.stop, DOWN], ["Target", levels.target, UP]] as [string, number, string][]).map(([name, price, color]) => (
          <span key={name} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span aria-hidden className="h-[5px] w-4 rounded-full" style={{ background: color }} />
            <span>{name}</span><span className="font-medium text-zinc-200 tabular-nums">{px(price)}</span>
          </span>
        ))}
        {band && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span aria-hidden className="h-2.5 w-4 rounded-sm" style={{ background: GOLD, opacity: 0.3 }} /><span>{t("Азийн хүрээ", "Asian range")}</span><span className="font-medium text-zinc-200 tabular-nums">{px(band.low)}–{px(band.high)}</span></span>}
        {SESSIONS.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5 whitespace-nowrap text-zinc-500"><span aria-hidden className="h-[5px] w-4 rounded-full" style={{ background: s.color }} />{sessionLabel(s.key, t)}</span>)}
      </figcaption>
    </figure>
  );
}
