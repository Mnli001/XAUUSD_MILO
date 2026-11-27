import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import { loadCandles, SYMBOL } from "./ingest/prices";

/**
 * The gold-drivers panel: where the dollar, real yields and futures positioning stand, how they changed, and how
 * gold has moved with them lately (correlation of daily changes over the last 60 shared days).
 */

type Obs = { date: string; value: number };
export type SeriesStat = { last: number; date: string; week: number | null; month: number | null; corr60: number | null; spark: number[] };
export type CotStat = { net: number; date: string; change: number | null; longPct: number; rank52: number; spark: number[] };
export type DriversView = {
  dollar: SeriesStat | null; real: SeriesStat | null; nominal: SeriesStat | null; cot: CotStat | null;
  tilt: { dollar: "up" | "down" | null; real: "up" | "down" | null; cot: "crowded" | "light" | "normal" | null };
};

/** Pearson correlation; null when either side does not move. */
export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const ma = a.slice(0, n).reduce((s, x) => s + x, 0) / n, mb = b.slice(0, n).reduce((s, x) => s + x, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db_ = b[i] - mb; sab += da * db_; saa += da * da; sbb += db_ * db_; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
}

/** Correlation of daily changes with gold's daily % change on the dates both have. `pct`: the series' change in % (else in points). */
function corrWithGold(series: Obs[], gold: Obs[], pct: boolean, days = 60): number | null {
  const g = new Map(gold.map((o) => [o.date, o.value]));
  const both = series.filter((o) => g.has(o.date));
  const a: number[] = [], b: number[] = [];
  for (let i = 1; i < both.length; i++) {
    const s0 = both[i - 1].value, s1 = both[i].value, g0 = g.get(both[i - 1].date)!, g1 = g.get(both[i].date)!;
    a.push(pct ? (s1 - s0) / s0 : s1 - s0);
    b.push((g1 - g0) / g0);
  }
  return correlation(a.slice(-days), b.slice(-days));
}

function stat(series: Obs[], gold: Obs[], pct: boolean): SeriesStat | null {
  if (!series.length) return null;
  const last = series.at(-1)!;
  const back = (k: number) => (series.length > k ? last.value - series[series.length - 1 - k].value : null);
  return { last: last.value, date: last.date, week: back(5), month: back(21), corr60: corrWithGold(series, gold, pct), spark: series.slice(-90).map((o) => o.value) };
}

export function driversView(d: { gold: Obs[]; dollar: Obs[]; real: Obs[]; nominal: Obs[]; cot: { date: string; net: number; oi: number }[] }): DriversView {
  const dollar = stat(d.dollar, d.gold, true), real = stat(d.real, d.gold, false), nominal = stat(d.nominal, d.gold, false);
  let cot: CotStat | null = null;
  if (d.cot.length) {
    const last = d.cot.at(-1)!, prev = d.cot.at(-2);
    const year = d.cot.slice(-52).map((r) => r.net);
    const below = year.filter((x) => x <= last.net).length;
    cot = { net: last.net, date: last.date, change: prev ? last.net - prev.net : null, longPct: Math.round((last.net / last.oi) * 1000) / 10, rank52: Math.round(((below - 1) / Math.max(1, year.length - 1)) * 100), spark: year };
  }
  const dir = (s: SeriesStat | null) => (s?.month == null ? null : s.month < 0 ? "down" : "up");
  return { dollar, real, nominal, cot, tilt: { dollar: dir(dollar), real: dir(real), cot: cot ? (cot.rank52 >= 90 ? "crowded" : cot.rank52 <= 10 ? "light" : "normal") : null } };
}

/** Everything the panel needs, from stored rows. */
export async function getDrivers(now: Date): Promise<DriversView> {
  const since = new Date(now.getTime() - 400 * 864e5).toISOString().slice(0, 10);
  const rows = await db.select().from(schema.macroSeries)
    .where(and(inArray(schema.macroSeries.series, ["DTWEXBGS", "DFII10", "DGS10", "COT_NC_NET", "COT_OI"]), gte(schema.macroSeries.date, since)))
    .orderBy(asc(schema.macroSeries.date));
  const of = (s: string) => rows.filter((r) => r.series === s).map((r) => ({ date: r.date, value: r.value }));
  const oi = new Map(of("COT_OI").map((r) => [r.date, r.value]));
  const cot = of("COT_NC_NET").filter((r) => oi.has(r.date)).map((r) => ({ date: r.date, net: r.value, oi: oi.get(r.date)! }));
  const gold = (await loadCandles(SYMBOL, "1day", 300)).map((c) => ({ date: c.time.toISOString().slice(0, 10), value: c.close }));
  return driversView({ gold, dollar: of("DTWEXBGS"), real: of("DFII10"), nominal: of("DGS10"), cot });
}

export async function hasMacroData(): Promise<boolean> {
  const [row] = await db.select({ s: schema.macroSeries.series }).from(schema.macroSeries).where(eq(schema.macroSeries.series, "DTWEXBGS")).limit(1);
  return !!row;
}
