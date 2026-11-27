/**
 * Chart drawings (trend lines, levels, zones, Fibonacci, notes, long/short plans) kept as time and price, so they
 * stay put on every timeframe. Pure: the layer that draws them is components/chart/DrawingLayer.tsx.
 */
export type Pt = { t: number; p: number }; // epoch ms (UTC), price
export const DRAW_KINDS = ["trend", "ray", "hline", "rect", "fib", "text", "long", "short"] as const;
export type DrawKind = (typeof DRAW_KINDS)[number];
export const DRAW_COLORS = ["amber", "blue", "green", "red", "white"] as const;
export type DrawColor = (typeof DRAW_COLORS)[number];
export type Drawing = { id: string; kind: DrawKind; a: Pt; b?: Pt; c?: Pt; color: DrawColor; text?: string };

export const DRAWINGS_MAX = 300;
export const TEXT_MAX = 120;
export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
/** Kinds placed with one click; the others take two. */
export const ONE_CLICK: ReadonlySet<DrawKind> = new Set(["hline", "text", "long", "short"]);

/** Where a time falls among the bars: a bar's open is its index, between bars is in between, past the ends one bar a step. */
export function timeToLogical(t: number, opens: readonly number[], step: number): number | null {
  const n = opens.length;
  if (!n) return null;
  if (t <= opens[0]) return (t - opens[0]) / step;
  if (t >= opens[n - 1]) return n - 1 + (t - opens[n - 1]) / step;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (opens[mid] <= t) lo = mid; else hi = mid; }
  return lo + (t - opens[lo]) / (opens[hi] - opens[lo]);
}

export function logicalToTime(l: number, opens: readonly number[], step: number): number | null {
  const n = opens.length;
  if (!n) return null;
  if (l <= 0) return opens[0] + l * step;
  if (l >= n - 1) return opens[n - 1] + (l - (n - 1)) * step;
  const i = Math.floor(l);
  return opens[i] + (l - i) * (opens[i + 1] - opens[i]);
}

/** A price pulled to the bar's nearest open, high, low or close when it lies within `reach`. */
export function magnet(price: number, bar: { open: number; high: number; low: number; close: number } | null, reach: number): number {
  if (!bar) return price;
  const best = [bar.open, bar.high, bar.low, bar.close].reduce((a, b) => (Math.abs(b - price) < Math.abs(a - price) ? b : a));
  return Math.abs(best - price) <= reach ? best : price;
}

/** Retracement levels of a swing from `start` to `end`: 0 at the end, 1 back at the start. */
export const fibLevels = (start: number, end: number) => FIB_RATIOS.map((ratio) => ({ ratio, price: end - (end - start) * ratio }));

/** A long or short plan: `a` the entry (and where it starts), `b` the target (and where it ends), `c` the stop. */
export function positionStats(d: Drawing) {
  const entry = d.a.p, tp = d.b?.p ?? d.a.p, sl = d.c?.p ?? d.a.p;
  const reward = Math.round(Math.abs(tp - entry) * 100) / 100, risk = Math.round(Math.abs(entry - sl) * 100) / 100;
  return { side: d.kind === "short" ? "SELL" as const : "BUY" as const, entry, tp, sl, reward, risk, rr: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0 };
}

/** A new plan at a click: the stop `dist` away, the target twice as far, twenty bars wide. */
export function newPosition(kind: "long" | "short", at: Pt, dist: number, step: number): Drawing {
  const up = kind === "long" ? 1 : -1;
  const r = (n: number) => Math.round(n * 100) / 100;
  return { id: crypto.randomUUID(), kind, a: at, b: { t: at.t + 20 * step, p: r(at.p + up * 2 * dist) }, c: { t: at.t, p: r(at.p - up * dist) }, color: kind === "long" ? "green" : "red" };
}

const okPt = (x: unknown): x is Pt => !!x && typeof x === "object" && Number.isFinite((x as Pt).t) && Number.isFinite((x as Pt).p);

/** Drawings as saved, checked: anything broken or unknown is dropped, text is cut short, the count is capped. */
export function parseDrawings(raw: unknown): Drawing[] {
  if (!Array.isArray(raw)) return [];
  const out: Drawing[] = [];
  for (const x of raw) {
    if (out.length >= DRAWINGS_MAX) break;
    if (!x || typeof x !== "object") continue;
    const d = x as Record<string, unknown>;
    if (typeof d.id !== "string" || !(DRAW_KINDS as readonly string[]).includes(d.kind as string) || !okPt(d.a)) continue;
    if (d.b !== undefined && !okPt(d.b)) continue;
    if (d.c !== undefined && !okPt(d.c)) continue;
    const kind = d.kind as DrawKind;
    if (!ONE_CLICK.has(kind) && !d.b) continue;
    if ((kind === "long" || kind === "short") && (!d.b || !d.c)) continue;
    const color = (DRAW_COLORS as readonly string[]).includes(d.color as string) ? (d.color as DrawColor) : "amber";
    const item: Drawing = { id: d.id.slice(0, 64), kind, a: { t: (d.a as Pt).t, p: (d.a as Pt).p }, color };
    if (d.b) item.b = { t: (d.b as Pt).t, p: (d.b as Pt).p };
    if (d.c) item.c = { t: (d.c as Pt).t, p: (d.c as Pt).p };
    if (typeof d.text === "string") item.text = d.text.slice(0, TEXT_MAX);
    out.push(item);
  }
  return out;
}
