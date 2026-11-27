import { and, desc, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { db, schema } from "../db";
import { parseFred } from "./macro";
import { SYMBOL } from "./prices";
import { surprise, surpriseStats } from "../surprise";
export { surprise, surpriseStats };

/**
 * Release figures and what gold did after them. The actual (and previous) number of each US release is read from
 * FRED once it is out; the forecast is typed by an admin. Gold's move 15 and 60 minutes after each release is
 * stored, so past releases can be split by whether they came in above or below the forecast.
 */

type Kind = "change_k" | "pct_mom" | "level_pct" | "rate";
export const RELEASE_SERIES: Record<string, { id: string; kind: Kind }> = {
  NFP: { id: "PAYEMS", kind: "change_k" },
  CPI: { id: "CPIAUCSL", kind: "pct_mom" },
  PPI: { id: "PPIFIS", kind: "pct_mom" },
  RETAIL: { id: "RSAFS", kind: "pct_mom" },
  PCE: { id: "PCEPI", kind: "pct_mom" },
  GDP: { id: "A191RL1Q225SBEA", kind: "level_pct" },
  FOMC: { id: "DFEDTARU", kind: "rate" },
};
type Obs = { date: string; value: number };
type Figures = { actual: string; previous: string | null; period: string };

const sign = (x: number, digits: number, unit: string) => `${x > 0 ? "+" : x < 0 ? "-" : ""}${Math.abs(x).toFixed(digits)}${unit}`;

/** The headline figure and the one before it, as a release reports them. */
export function figuresFor(kind: Exclude<Kind, "rate">, o: Obs[]): Figures | null {
  const n = o.length;
  if (kind === "level_pct") return n >= 2 ? { actual: `${o[n - 1].value.toFixed(1)}%`, previous: `${o[n - 2].value.toFixed(1)}%`, period: o[n - 1].date } : null;
  if (n < 3) return null;
  const f = (a: number, b: number) => (kind === "change_k" ? sign(Math.round(a - b), 0, "K") : sign(((a / b) - 1) * 100, 1, "%"));
  return { actual: f(o[n - 1].value, o[n - 2].value), previous: f(o[n - 2].value, o[n - 3].value), period: o[n - 1].date };
}

/** The Fed's upper target the day after a decision, and the day before. */
function rateFigures(o: Obs[], day: string): Figures | null {
  const after = o.find((x) => x.date > day);
  const before = [...o].reverse().find((x) => x.date < day);
  return after ? { actual: `${after.value.toFixed(2)}%`, previous: before ? `${before.value.toFixed(2)}%` : null, period: after.date } : null;
}

async function series(fredKey: string, id: string, start: string): Promise<Obs[]> {
  const q = new URLSearchParams({ series_id: id, api_key: fredKey, file_type: "json", observation_start: start });
  const res = await fetch(`https://api.stlouisfed.org/fred/series/observations?${q}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFred(await res.json());
}

/**
 * Releases of the last 10 days that are out but have no actual yet get it from FRED, when FRED already has a
 * period newer than the one the previous release of that type used (until then it is tried again next hour).
 */
export async function fillActuals(fredKey: string | undefined, now: Date): Promise<number> {
  if (!fredKey) return 0;
  const e = schema.economicEvents;
  const due = await db.select().from(e).where(and(isNull(e.actual), lte(e.time, now), gte(e.time, new Date(now.getTime() - 10 * 864e5)), inArray(e.type, Object.keys(RELEASE_SERIES))));
  let filled = 0;
  const cache = new Map<string, Promise<Obs[]>>();
  for (const ev of due) {
    const spec = RELEASE_SERIES[ev.type];
    const start = new Date(ev.time.getTime() - 200 * 864e5).toISOString().slice(0, 10);
    if (!cache.has(spec.id)) cache.set(spec.id, series(fredKey, spec.id, start).catch((err) => { console.warn(`[actuals] ${spec.id} failed: ${err instanceof Error ? err.message : err}`); return []; }));
    const o = await cache.get(spec.id)!;
    const fig = spec.kind === "rate" ? rateFigures(o, ev.time.toISOString().slice(0, 10)) : figuresFor(spec.kind, o);
    if (!fig) continue;
    const [before] = await db.select({ p: e.actualPeriod }).from(e).where(and(eq(e.type, ev.type), isNotNull(e.actualPeriod), lte(e.time, ev.time))).orderBy(desc(e.time)).limit(1);
    if (before?.p && fig.period <= before.p) continue; // FRED does not have this release's figure yet
    await db.update(e).set({ actual: fig.actual, previous: ev.previous ?? fig.previous, actualPeriod: fig.period }).where(and(eq(e.id, ev.id), isNull(e.actual)));
    filled++;
  }
  return filled;
}

/** Stores gold's move 15 and 60 minutes after each past release (last 3 years) that does not have it yet. */
export async function recordMoves(now: Date): Promise<number> {
  const e = schema.economicEvents, c = schema.candles;
  const due = await db.select({ id: e.id, time: e.time }).from(e)
    .where(and(isNull(e.move60), lte(e.time, new Date(now.getTime() - 75 * 6e4)), gte(e.time, new Date(now.getTime() - 3 * 365 * 864e5))));
  let done = 0;
  for (const ev of due) {
    const t0 = ev.time.getTime();
    const bars = await db.select().from(c).where(and(eq(c.symbol, SYMBOL), eq(c.timeframe, "15min"), inArray(c.time, [0, 45].map((m) => new Date(t0 + m * 6e4)))));
    const ref = bars.find((b) => b.time.getTime() === t0), end60 = bars.find((b) => b.time.getTime() === t0 + 45 * 6e4);
    if (!ref || !end60) {
      // no candles for it (before the stored history, or a gap): marked, so it is not looked up every hour
      if (now.getTime() - t0 > 2 * 864e5) await db.update(e).set({ move15: NaN, move60: NaN }).where(eq(e.id, ev.id));
      continue;
    }
    await db.update(e).set({ move15: ref.close - ref.open, move60: end60.close - ref.open }).where(eq(e.id, ev.id));
    done++;
  }
  return done;
}
