/**
 * The Asian rule on the broker's own history (MT5 export, 2019 →), to find what separates its weak
 * years (2019–2024) from its strong ones. Filters are chosen on 2019–2022 only and then judged,
 * untouched, on 2023 → today.
 *   1. run mt5/tester/XauExport.mq5 in the Strategy Tester (writes Common\Files\xau_*.csv)
 *   2. npx tsx --env-file=.env scripts/broker-research.ts
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Candle } from "../src/lib/analysis/indicators";
import { atrSeries, ema } from "../src/lib/analysis/indicators";
import { asianRangeOrders } from "../src/lib/bot/ideas";
import { alignClosed, simulateOrders, type Order } from "../src/lib/bot/backtest";
import { DEFAULT_PARAMS, scoreSeries, type BotParams } from "../src/lib/bot/strategy";
import { loadCandles, SYMBOL } from "../src/lib/ingest/prices";
import { closeDb, db, schema } from "../src/lib/db";
import { eq } from "drizzle-orm";

const FILES = path.join(homedir(), "AppData", "Roaming", "MetaQuotes", "Terminal", "Common", "Files");
const H = 36e5;

/** Last Sunday of a month, 01:00 UTC: when EU clocks change. */
const lastSunday = (y: number, m: number) => { const d = new Date(Date.UTC(y, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
/** Second Sunday of March / first Sunday of November (US), 07:00 UTC. */
const usStart = (y: number) => { const d = new Date(Date.UTC(y, 2, 1, 7)); d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7) + 7); return d.getTime(); };
const usEnd = (y: number) => { const d = new Date(Date.UTC(y, 10, 1, 6)); d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7)); return d.getTime(); };
type Clock = "EU" | "US";
const offsetH = (serverMs: number, clock: Clock) => {
  const y = new Date(serverMs).getUTCFullYear(), approx = serverMs - 2 * H;
  const summer = clock === "EU" ? approx >= lastSunday(y, 2) && approx < lastSunday(y, 9) : approx >= usStart(y) && approx < usEnd(y);
  return summer ? 3 : 2;
};

function load(tf: string, clock: Clock): Candle[] {
  const rows = readFileSync(path.join(FILES, `xau_${tf}.csv`), "latin1").trim().split(/\r?\n/).slice(1);
  return rows.map((l) => {
    const [t, o, h, lo, c] = l.split(",").map(Number);
    const server = t * 1000;
    // Daily and 4-hour bars are the broker's own sessions: kept at their server start, shifted to UTC.
    return { time: new Date(server - offsetH(server, clock) * H), open: o, high: h, low: lo, close: c };
  });
}

type T = { r: number; openedAt: Date; direction: string };
const stats = (ts: T[]) => {
  let w = 0, g = 0, l = 0, s = 0, peak = 0, dd = 0;
  for (const t of ts) { if (t.r > 0) { w++; g += t.r; } else l -= t.r; s += t.r; peak = Math.max(peak, s); dd = Math.max(dd, peak - s); }
  return { n: ts.length, win: ts.length ? (100 * w) / ts.length : 0, avg: ts.length ? s / ts.length : 0, pf: l > 0 ? g / l : Infinity, dd, sum: s };
};
const f = (x: ReturnType<typeof stats>) => `${String(x.n).padStart(4)} tr ${x.win.toFixed(0).padStart(3)}% avg ${(x.avg >= 0 ? "+" : "") + x.avg.toFixed(3)}R PF ${x.pf.toFixed(2)} DD ${x.dd.toFixed(1)}R`;

async function main() {
  // 1. which clock does the broker keep? compare 15-minute closes with the stored (UTC) candles
  const stored = await loadCandles(SYMBOL, "15min", 200000);
  const byTime = new Map(stored.map((c) => [c.time.getTime(), c.close]));
  let clock: Clock = "EU", best = -1;
  for (const c of ["EU", "US"] as Clock[]) {
    const m = load("m15", c);
    let hits = 0, n = 0;
    for (const b of m) { const s = byTime.get(b.time.getTime()); if (s === undefined) continue; n++; if (Math.abs(s - b.close) < 1.5) hits++; }
    console.log(`clock ${c}: ${n} shared bars, ${((100 * hits) / Math.max(1, n)).toFixed(1)}% closes within $1.50`);
    if (hits > best) { best = hits; clock = c; }
  }
  const m15 = load("m15", clock).filter((b) => b.time.getUTCFullYear() >= 2019);
  const h4 = load("h4", clock), d1 = load("d1", clock);
  const events = await db.select({ time: schema.economicEvents.time }).from(schema.economicEvents).where(eq(schema.economicEvents.impact, "HIGH"));
  const news = events.map((e) => e.time);
  const newsFrom = news.length ? new Date(Math.min(...news.map((d) => d.getTime()))) : null;
  console.log(`using ${clock} clock · 15m ${m15[0].time.toISOString().slice(0, 10)} → ${m15.at(-1)!.time.toISOString().slice(0, 10)} · news stored from ${newsFrom?.toISOString().slice(0, 10)}`);

  const decisions = m15.map((c) => c.time.getTime() + 15 * 6e4);
  const daily = alignClosed(decisions, d1, scoreSeries(d1), "1day");
  const four = alignClosed(decisions, h4, scoreSeries(h4), "4h");
  const dAtr = alignClosed(decisions, d1, atrSeries(d1), "1day");
  const dAtrSlow = alignClosed(decisions, d1, ema(atrSeries(d1).map((x) => (Number.isFinite(x) ? x : 0)), 100), "1day");
  const d1Close = d1.map((c) => c.close), e200 = ema(d1Close, 200), e50 = ema(d1Close, 50);
  const d1e200 = alignClosed(decisions, d1, e200, "1day"), d1e50 = alignClosed(decisions, d1, e50, "1day");

  const params: BotParams = { ...DEFAULT_PARAMS, breakeven: false, maxTradesPerDay: 2 };
  const ready = daily.findIndex((x) => x !== null) ;
  const run = (orders: (Order | null)[]) => simulateOrders(m15, orders.map((o, i) => (i >= ready ? o : null)), params, 1_000_000).trades as T[];
  // No stored news before newsFrom: the filter is left out everywhere so both periods are treated alike.
  const base = (rr: number) => asianRangeOrders(m15, { rr, news: [], params, trend: daily, confirm: four });
  const keep = (src: (Order | null)[], ok: (i: number, o: Order) => boolean) => src.map((o, i) => (o && ok(i, o) ? o : null));

  const CUT = Date.UTC(2023, 0, 1);
  const show = (label: string, ts: T[]) => {
    const a = stats(ts.filter((t) => t.openedAt.getTime() < CUT)), b = stats(ts.filter((t) => t.openedAt.getTime() >= CUT));
    console.log(`  ${label.padEnd(44)} 2019–22: ${f(a)}  |  2023→: ${f(b)}`);
    return { a, b };
  };
  const rule = run(base(3));
  console.log("\nTHE RULE (daily + 4h trend, 3R), by year:");
  for (const y of [...new Set(rule.map((t) => t.openedAt.getUTCFullYear()))]) console.log(`  ${y}: ${f(stats(rule.filter((t) => t.openedAt.getUTCFullYear() === y)))}`);

  console.log("\nCANDIDATES (chosen on 2019–22, judged on 2023→):");
  const rows: { label: string; a: ReturnType<typeof stats>; b: ReturnType<typeof stats> }[] = [];
  const add = (label: string, orders: (Order | null)[]) => rows.push({ label, ...show(label, run(orders)) });
  add("the rule", base(3));
  add("RR 2", base(2));
  add("RR 4", base(4));
  for (const k of [20, 40, 60]) add(`|daily score| ≥ ${k}`, keep(base(3), (i) => Math.abs(daily[i] ?? 0) >= k));
  for (const k of [20, 40, 60]) add(`|4h score| ≥ ${k}`, keep(base(3), (i) => Math.abs(four[i] ?? 0) >= k));
  for (const k of [0.9, 1.0, 1.1, 1.2]) add(`daily ATR ≥ ${k}× its 100-day average`, keep(base(3), (i) => (dAtr[i] ?? 0) >= k * (dAtrSlow[i] ?? Infinity)));
  for (const k of [0.15, 0.2, 0.3]) add(`stop ≥ ${k}× daily ATR`, keep(base(3), (i, o) => o.stopDist >= k * (dAtr[i] ?? Infinity)));
  for (const k of [0.5, 0.7]) add(`stop ≤ ${k}× daily ATR`, keep(base(3), (i, o) => o.stopDist <= k * (dAtr[i] ?? 0)));
  add("price beyond daily EMA200 by ≥ 1 ATR", keep(base(3), (i, o) => { const d = (m15[i].close - (d1e200[i] ?? NaN)) * (o.side === "BUY" ? 1 : -1); return d >= (dAtr[i] ?? Infinity); }));
  add("daily EMA50 beyond EMA200 (trend side)", keep(base(3), (i, o) => ((d1e50[i] ?? 0) - (d1e200[i] ?? 0)) * (o.side === "BUY" ? 1 : -1) > 0));
  add("entry before 12:00 UTC", keep(base(3), (i) => m15[i].time.getUTCHours() < 12));
  add("entry from 12:00 UTC", keep(base(3), (i) => m15[i].time.getUTCHours() >= 12));
  add("BUY only", keep(base(3), (_, o) => o.side === "BUY"));
  add("SELL only", keep(base(3), (_, o) => o.side === "SELL"));
  for (const k of [0.25, 0.35, 0.4]) add(`stop ≥ ${k}× daily ATR`, keep(base(3), (i, o) => o.stopDist >= k * (dAtr[i] ?? Infinity)));
  const wide = (k: number, rr = 3, src = base(rr)) => keep(src, (i, o) => o.stopDist >= k * (dAtr[i] ?? Infinity));
  add("stop ≥ 0.3 ATR + |4h score| ≥ 60", keep(wide(0.3), (i) => Math.abs(four[i] ?? 0) >= 60));
  add("stop ≥ 0.3 ATR + |daily score| ≥ 20", keep(wide(0.3), (i) => Math.abs(daily[i] ?? 0) >= 20));
  add("stop ≥ 0.3 ATR, RR 2", wide(0.3, 2));
  add("stop ≥ 0.3 ATR, RR 4", wide(0.3, 4));
  const chosen = run(wide(0.3));
  console.log("\nstop ≥ 0.3× daily ATR, by year:");
  for (const y of [...new Set(chosen.map((t) => t.openedAt.getUTCFullYear()))]) console.log(`  ${y}: ${f(stats(chosen.filter((t) => t.openedAt.getUTCFullYear() === y)))}`);
  // From the first stored release on, with and without the news filter
  const since = (src: (Order | null)[]) => simulateOrders(m15, src.map((o, i) => (m15[i].time >= newsFrom! ? o : null)), params, 1_000_000).trades as T[];
  const newsBase = asianRangeOrders(m15, { rr: 3, news, params, trend: daily, confirm: four });
  console.log(`  since ${newsFrom!.toISOString().slice(0, 10)}  the rule: no news filter ${f(stats(since(base(3))))} | news filter ${f(stats(since(newsBase)))}`);
  console.log(`  since ${newsFrom!.toISOString().slice(0, 10)}  + stop ≥ 0.3 ATR: no news filter ${f(stats(since(wide(0.3))))} | news filter ${f(stats(since(wide(0.3, 3, newsBase))))}`);

  console.log("\nHELD UP (better than the rule on 2019–22 AND on 2023→, ≥ 60 trades in each):");
  const ref = rows[0];
  for (const r of rows.slice(1)) if (r.a.n >= 60 && r.b.n >= 60 && r.a.avg > ref.a.avg && r.b.avg > ref.b.avg) console.log(`  ${r.label}: 2019–22 ${r.a.avg.toFixed(3)}R PF ${r.a.pf.toFixed(2)} | 2023→ ${r.b.avg.toFixed(3)}R PF ${r.b.pf.toFixed(2)}`);
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
