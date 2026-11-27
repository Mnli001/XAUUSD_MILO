/**
 * Equity curves of the live system as deployed, for the site: src/data/backtest-curves.json (method, caveats and the
 * before/after table in docs/backtest-curves.md).
 * Broker candles (JustMarkets XAUUSD, via scripts/broker-data.ts), machinery copied from scripts/exposure-cap-research.ts
 * (itself from scripts/xau-alpha-research.ts): daily / 4h scoreSeries aligned to CLOSED bars, daily ATR, entry at the
 * next bar's open ± spread, stop checked first inside a bar, gaps fill at the open, trades crossing an M15 hole
 * > 4 days dropped, $1,500 closed-balance account, CAGR over the weeks the data covers.
 * Live system = the 3 session breakouts of src/lib/setup/sessionRules.ts (first trend-agreeing breakout decides the day)
 * and the robot's order handling in mt5/XauBot.mq5 (TakeOrder / SizeTrade / EntryBlockedWhy):
 *  - news "skip" (src/lib/setup/setups.ts): a breakout closing within 30 min before / 60 min after a stored HIGH
 *    release ends the day for that range. Releases are stored only from the first economic_events row (late 2023):
 *    trades before it are kept and counted as "no news data".
 *  - at most 3 open positions (EntryBlockedWhy): a 4th signal is skipped.
 *  - lots = floor(risk / stop) to the 0.01 step, then × sizeFactor(D1, 4H) × 0.5 when a same-direction session
 *    position is open (SAME_DIR_MUL; a product under 0.01 keeps the unmultiplied lots, as ApplyMul does).
 *    SMALL_ACCOUNT: if 0.01 lot ($1 per $1 move) risks more than 1.2 × the intended (multiplied) risk, the trade is skipped.
 *  - swap $0.25/oz per night held past the broker's rollover (server midnight = 21:00 / 22:00 UTC), Wednesday × 3.
 * The previous model (fractional sizing, no cap, no news filter, no swap) is rerun alongside for the docs' table.
 *   npx tsx --env-file=.env scripts/export-equity-curves.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { load } from "./broker-data";
import { alignClosed } from "../src/lib/bot/backtest";
import { atrSeries, type Candle } from "../src/lib/analysis/indicators";
import { scoreSeries, DEFAULT_PARAMS } from "../src/lib/bot/strategy";
import { SESSION_RULES, sizeFactor, type SessionRule } from "../src/lib/setup/sessionRules";
import { db, schema, closeDb } from "../src/lib/db";

const M15 = 15 * 6e4, H = 36e5, DAY = 864e5, WK = 7 * DAY, YR = 365.25 * DAY, HOLE = 4 * DAY;
const START = 1500, SPREAD = 0.3, SPREAD_WIDE = 0.5, SAME_DIR_MUL = 0.5, RISKS = [0.5, 1, 1.5, 2, 3];
const POSITION_CAP = 3, SWAP_PER_OZ_NIGHT = 0.25, SMALL_ACCOUNT_X = 1.2, LOT_STEP = 0.01, OZ_PER_LOT = 100;
const NEWS_BEFORE = DEFAULT_PARAMS.newsBeforeMin * 6e4, NEWS_AFTER = DEFAULT_PARAMS.newsAfterMin * 6e4;
const OUT = path.join(__dirname, "..", "src", "data", "backtest-curves.json");

// ───────────────────────────── data ─────────────────────────────
type Ctx = { m15: Candle[]; t: number[]; daily: (number | null)[]; four: (number | null)[]; atrD: number[]; news: number[]; newsFrom: number };
let CTX: Ctx;
const sgn = (x: number | null) => (x === null ? 0 : Math.sign(x));
const hourOf = (d: Date) => d.getUTCHours() + d.getUTCMinutes() / 60;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const monthKey = (ms: number) => new Date(ms).toISOString().slice(0, 7);

/** The broker's rollover (server midnight, EU clock GMT+2/+3) of the UTC date `d0`: 21:00 UTC in EU summer time, else 22:00. */
const lastSunday = (y: number, m: number) => { const d = new Date(Date.UTC(y, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
const rolloverOf = (d0: number) => { const y = new Date(d0).getUTCFullYear(), noon = d0 + 12 * H; return d0 + (noon >= lastSunday(y, 2) && noon < lastSunday(y, 9) ? 21 : 22) * H; };
/** Swap nights charged between entry and exit: each rollover the position is open through, Wednesday's counts 3. */
function swapNights(entryT: number, end: number) {
  let n = 0;
  for (let d0 = Date.parse(`${dayKey(entryT)}T00:00:00Z`); d0 < end; d0 += DAY) {
    const r = rolloverOf(d0);
    if (r > entryT && r < end) n += new Date(d0).getUTCDay() === 3 ? 3 : 1;
  }
  return n;
}
const inNews = (at: number) => {
  for (const n of CTX.news) { if (n - NEWS_BEFORE > at) break; if (at <= n + NEWS_AFTER) return true; }
  return false;
};

/** r = gross R of the price path; riskPx = stop distance from the filled entry ($/oz); nights = swap nights. */
type Trade = { r: number; at: number; entryT: number; end: number; rule: string; side: number; d1: number; h4: number; riskPx: number; nights: number; news: boolean; noNewsData: boolean };

function walk(j0: number, side: number, entry: number, stop: number, target: number, risk: number, exitAt: number) {
  const { m15, t } = CTX, R = (px: number) => (side * (px - entry)) / risk;
  for (let j = j0; j < m15.length; j++) {
    const c = m15[j];
    if (j > j0 && t[j] - t[j - 1] > HOLE) return null;
    if (t[j] >= exitAt) return { r: R(c.open), end: t[j] };
    if (side > 0 ? c.low <= stop : c.high >= stop) return { r: R(side > 0 ? Math.min(stop, c.open) : Math.max(stop, c.open)), end: t[j] + M15 };
    if (side > 0 ? c.high >= target : c.low <= target) return { r: R(target), end: t[j] + M15 };
  }
  return null;
}
/** Every day's first trend-agreeing breakout of `rule`; `news` marks one the live news "skip" rule would not take. */
function ruleTrades(rule: SessionRule, spread: number): Trade[] {
  const { m15, t } = CTX, out: Trade[] = [];
  let day = "", hi = -Infinity, lo = Infinity, n = 0, done = false;
  for (let i = 0; i < m15.length - 1; i++) {
    const b = m15[i], k = dayKey(t[i]);
    if (k !== day) { day = k; hi = -Infinity; lo = Infinity; n = 0; done = false; }
    const h = hourOf(b.time);
    if (h >= rule.rangeFrom && h < rule.rangeTo) { hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); n++; continue; }
    if (done || h < rule.rangeTo || h >= rule.entryTo || n < rule.minBars) continue;
    const side = b.close > hi ? 1 : b.close < lo ? -1 : 0;
    if (!side) continue;
    const d = CTX.daily[i], f = CTX.four[i];
    if (sgn(d) !== side || sgn(f) !== side) continue;
    done = true; // the first trend-agreeing breakout decides the day (a news-window one too: "skip" ends the day)
    const decided = t[i] + M15, news = inNews(decided), noNewsData = decided < CTX.newsFrom;
    const mid = (hi + lo) / 2, R0 = Math.abs(b.close - mid);
    if (!(R0 >= rule.minStopAtr * CTX.atrD[i])) continue;
    if (rule.minDailyScore && Math.abs(d!) < rule.minDailyScore) continue;
    const nx = m15[i + 1];
    if (side * (nx.open - mid) <= 0) continue;
    const d0 = Date.parse(`${k}T00:00:00Z`), fri = new Date(d0).getUTCDay() === 5;
    const exitAt = rule.exit === "same20" || fri ? d0 + 20 * H : d0 + 31 * H;
    const entry = nx.open + side * spread, risk = side * (entry - mid);
    if (!(risk > 0.2)) continue;
    const res = walk(i + 1, side, entry, mid, entry + side * rule.rr * risk, risk, exitAt);
    if (res) out.push({ r: res.r, at: t[i], entryT: t[i + 1], end: res.end, rule: rule.id, side, d1: d!, h4: f!, riskPx: risk, nights: swapNights(t[i + 1], res.end), news, noNewsData });
  }
  return out;
}
const allTrades = (spread: number) => SESSION_RULES.flatMap((r) => ruleTrades(r, spread)).sort((a, b) => a.entryT - b.entryT || a.at - b.at);

// ───────────────────────────── account ─────────────────────────────
/** cap = 3-position cap; lots = 0.01-step lots as the robot rounds them; minLotX = small-account skip threshold (Infinity = off). */
type Model = { cap: boolean; lots: boolean; swap: boolean; minLotX: number };
const OLD: Model = { cap: false, lots: false, swap: false, minLotX: Infinity }, NEW: Model = { cap: true, lots: true, swap: true, minLotX: SMALL_ACCOUNT_X };
const netR = (x: Trade, swap: boolean) => x.r - (swap ? (SWAP_PER_OZ_NIGHT * x.nights) / x.riskPx : 0);
const floorLots = (v: number) => Math.floor(v / LOT_STEP + 1e-9) * LOT_STEP;

/**
 * Closed-balance account; returns final balance, max DD, every balance change (time, balance), the trades taken and
 * how many signals the position cap and the small-account rule skipped. `pct` < 0 = sizing off (R-only pass for the cap).
 */
function account(ts: Trade[], pct: number, m: Model) {
  let bal = START, pk = START, dd = 0, capSkips = 0, minLotSkips = 0, swapUsd = 0;
  const open: { side: number; usd: number; end: number }[] = [], events: [number, number][] = [], taken: Trade[] = [];
  const closeUntil = (tm: number) => {
    open.sort((a, b) => a.end - b.end);
    while (open.length && open[0].end <= tm) {
      const q = open.shift()!;
      bal += q.usd; pk = Math.max(pk, bal); dd = Math.max(dd, (100 * (pk - bal)) / pk);
      events.push([q.end, bal]);
    }
  };
  for (const x of ts) {
    closeUntil(x.entryT);
    if (m.cap && open.length >= POSITION_CAP) { capSkips++; continue; }
    const mul = sizeFactor(x.d1, x.h4) * (open.some((o) => o.side === x.side) ? SAME_DIR_MUL : 1);
    const riskUsd = (Math.max(pct, 0) / 100) * bal;
    let usd: number;
    // mt5/XauBot.mq5 SizeTrade(canShrink = false): the small-account check on the multiplied risk (0.01 lot = $1 per $1 move)
    const minRisk = LOT_STEP * OZ_PER_LOT * x.riskPx, want = riskUsd * Math.max(0.25, Math.min(2, mul));
    if (pct > 0 && minRisk > m.minLotX * want + 1e-9) { minLotSkips++; continue; }
    if (!m.lots) usd = riskUsd * mul * netR(x, m.swap);
    else {
      // …lots for the base risk floored to the step (the minimum lot when under it), then ApplyMul: the multiplier
      // floored again, the unmultiplied lots kept if that comes to 0.
      let lots = floorLots(riskUsd / (x.riskPx * OZ_PER_LOT));
      if (lots < LOT_STEP - 1e-9) lots = LOT_STEP;
      const l2 = floorLots(lots * mul);
      lots = l2 >= LOT_STEP - 1e-9 ? l2 : lots;
      usd = lots * OZ_PER_LOT * x.riskPx * netR(x, m.swap);
      if (m.swap) swapUsd += lots * OZ_PER_LOT * SWAP_PER_OZ_NIGHT * x.nights;
    }
    taken.push(x);
    open.push({ end: x.end, usd, side: x.side });
  }
  closeUntil(Infinity);
  return { bal, dd, ret: (100 * (bal - START)) / START, events, taken, capSkips, minLotSkips, swapUsd };
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const sumR = (q: Trade[], swap = true) => q.reduce((s, x) => s + netR(x, swap), 0);

async function main() {
  const rows = await db.select({ time: schema.economicEvents.time }).from(schema.economicEvents).where(eq(schema.economicEvents.impact, "HIGH"));
  await closeDb();
  const news = rows.map((e) => e.time.getTime()).sort((a, b) => a - b);
  if (!news.length) throw new Error("no HIGH economic_events in the database: run with --env-file=.env");
  const newsFrom = Date.parse(`${dayKey(news[0])}T00:00:00Z`);

  const m15 = load("m15", "EU").filter((b) => b.time.getUTCFullYear() >= 2019), h4 = load("h4", "EU"), d1 = load("d1", "EU");
  const dec = m15.map((c) => c.time.getTime() + M15);
  CTX = { m15, t: m15.map((c) => c.time.getTime()), daily: alignClosed(dec, d1, scoreSeries(d1), "1day"), four: alignClosed(dec, h4, scoreSeries(h4), "4h"), atrD: alignClosed(dec, d1, atrSeries(d1), "1day").map((x) => x ?? NaN), news, newsFrom };
  const T0 = CTX.t[0], T1 = CTX.t.at(-1)!;
  // covered time = weeks with ≥ 300 M15 bars (a full week has ~460)
  const A0 = Date.UTC(2018, 11, 31), wk = new Map<number, number>();
  for (const x of CTX.t) { const k = Math.floor((x - A0) / WK); wk.set(k, (wk.get(k) ?? 0) + 1); }
  const coveredWeeks = [...wk.values()].filter((n) => n >= 300).length, coveredYears = (coveredWeeks * WK) / YR;
  const holes: [string, string][] = [];
  for (let i = 1; i < CTX.t.length; i++) if (CTX.t[i] - CTX.t[i - 1] > HOLE) holes.push([dayKey(CTX.t[i - 1]), dayKey(CTX.t[i])]);
  console.log(`DATA: JustMarkets M15 ${dayKey(T0)} → ${dayKey(T1)} (${m15.length} bars), H4 ${h4.length}, D1 ${d1.length}. Covered weeks ${coveredWeeks} = ${coveredYears.toFixed(2)} yrs (calendar ${((T1 - T0) / YR).toFixed(2)}). Holes > 4 days: ${holes.map((h) => h.join(" → ")).join(", ") || "none"}`);
  console.log(`NEWS: ${news.length} HIGH releases stored, ${dayKey(news[0])} → ${dayKey(news.at(-1)!)}`);

  // ── trades: the old model takes every signal; the new one drops news-window breakouts, then the position cap ──
  const summary = (label: string, q: Trade[], swap: boolean) => {
    const n = q.length, w = q.filter((x) => netR(x, swap) > 0).length;
    const g = q.reduce((s, x) => s + Math.max(0, netR(x, swap)), 0), l = q.reduce((s, x) => s - Math.min(0, netR(x, swap)), 0);
    console.log(`${label}: ${n} trades · win ${((100 * w) / n).toFixed(1)}% · avg ${(sumR(q, swap) / n).toFixed(3)}R · PF ${(g / l).toFixed(2)} · ${SESSION_RULES.map((r) => { const z = q.filter((x) => x.rule === r.id); return `${r.id} ${z.length} ${(sumR(z, swap) / z.length).toFixed(3)}R`; }).join(" · ")}`);
    return { n, wins: w, g, l };
  };
  const tsAll = allTrades(SPREAD);
  summary("OLD MODEL TRADES (no news filter, no cap, no swap)", tsAll, false);
  const tsNews = tsAll.filter((x) => !x.news);
  const newsSkipped = tsAll.length - tsNews.length;
  const capPass = account(tsNews, -1, { ...NEW, lots: false, minLotX: Infinity });
  const ts = capPass.taken;
  const noNewsData = ts.filter((x) => x.noNewsData).length, held = ts.filter((x) => x.nights > 0);
  console.log(`NEW MODEL FILTERS: news skip ${newsSkipped} (of ${tsAll.filter((x) => !x.noNewsData).length} signals since ${dayKey(newsFrom)}) · position cap ${capPass.capSkips} · kept without news data (before ${dayKey(newsFrom)}): ${noNewsData}`);
  console.log(`SWAP: ${held.length} trades held past rollover, ${held.reduce((s, x) => s + x.nights, 0)} nights charged, cost ${(ts.reduce((s, x) => s + netR(x, false) - netR(x, true), 0)).toFixed(2)}R in total`);
  const st = summary("NEW MODEL TRADES (net of swap)", ts, true);

  const years = [...new Set(ts.map((x) => new Date(x.at).getUTCFullYear()))].sort().map((y) => {
    const q = ts.filter((x) => new Date(x.at).getUTCFullYear() === y);
    return { year: y, trades: q.length, r: r2(sumR(q)), winRate: r2((100 * q.filter((x) => netR(x, true) > 0).length) / q.length) };
  });
  for (const y of years) console.log(`  ${y.year}: n ${y.trades} · ${y.r >= 0 ? "+" : ""}${y.r}R · win ${y.winRate}%`);
  const totalR = sumR(ts), r2426 = sumR(ts.filter((x) => new Date(x.at).getUTCFullYear() >= 2024));
  const isR = sumR(ts.filter((x) => new Date(x.at).getUTCFullYear() <= 2022)), oosR = sumR(ts.filter((x) => new Date(x.at).getUTCFullYear() >= 2023));
  console.log(`  2019–22 (in-sample) ${isR.toFixed(2)}R · 2023 → (checked) ${oosR.toFixed(2)}R · 2024–26 share of all R ${((100 * r2426) / totalR).toFixed(1)}%`);

  // months from the first data month to the last
  const months: string[] = [];
  for (let d = new Date(Date.UTC(new Date(T0).getUTCFullYear(), new Date(T0).getUTCMonth(), 1)); d.getTime() <= T1; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(monthKey(d.getTime()));

  const curve = (a: ReturnType<typeof account>, risk: number) => {
    let k = 0, bal = START;
    const exact = months.map((m) => { while (k < a.events.length && monthKey(a.events[k][0]) <= m) bal = a.events[k++][1]; return bal; });
    const mret = exact.map((b, i) => (100 * b) / (i ? exact[i - 1] : START) - 100);
    const cagr = 100 * (Math.pow(a.bal / START, 1 / coveredYears) - 1);
    return { risk, finalPct: r2(a.ret), cagr: r2(cagr), maxDD: r2(a.dd), worstMonth: r2(Math.min(...mret)), bestMonth: r2(Math.max(...mret)), monthly: months.map((m, i) => ({ m, eq: Math.round(exact[i]) })) };
  };
  const line = (label: string, c: ReturnType<typeof curve>, a: ReturnType<typeof account>, extra = "") =>
    console.log(`  ${label} ${String(c.risk).padStart(3)}%: final $${a.bal.toFixed(0).padStart(6)} (${c.finalPct >= 0 ? "+" : ""}${c.finalPct.toFixed(1)}%) · CAGR ${c.cagr.toFixed(2)}% · closed DD ${c.maxDD.toFixed(2)}% · months ${c.worstMonth.toFixed(2)}% … +${c.bestMonth.toFixed(2)}%${extra}`);

  console.log("\nOLD MODEL (spread $0.30, fractional size, no cap / news / swap):");
  for (const risk of RISKS) { const a = account(tsAll, risk, OLD); line("old", curve(a, risk), a); }
  console.log("\nNEW MODEL (spread $0.30) — written to the JSON:");
  const risks = RISKS.map((risk) => {
    const a = account(tsNews, risk, NEW), c = curve(a, risk);
    line("new", c, a, ` · taken ${a.taken.length} · cap skips ${a.capSkips} · min-lot skips ${a.minLotSkips} (${((100 * a.minLotSkips) / (a.taken.length + a.minLotSkips)).toFixed(1)}%) · swap $${a.swapUsd.toFixed(0)}`);
    return c;
  });
  console.log("\nDECOMPOSITION (cap + news + swap in all, spread $0.30) — docs only:");
  const variants: [string, Model][] = [
    ["fractional size, no min-lot rule ", { ...NEW, lots: false, minLotX: Infinity }],
    ["0.01-lot rounding, no skip rule  ", { ...NEW, minLotX: Infinity }],
    [`fractional size + ${SMALL_ACCOUNT_X}× skip      `, { ...NEW, lots: false }],
    ["robot v3.92 2.5× skip + rounding ", { ...NEW, minLotX: 2.5 }],
  ];
  for (const [label, m] of variants) for (const risk of RISKS) { const a = account(tsNews, risk, m); line(label, curve(a, risk), a, ` · min-lot skips ${a.minLotSkips}`); }
  console.log("\nNEW MODEL, spread $0.50 — docs only:");
  const tsWide = allTrades(SPREAD_WIDE).filter((x) => !x.news);
  {
    const q = account(tsWide, -1, { ...NEW, lots: false, minLotX: Infinity }).taken;
    console.log(`  trades ${q.length} · avg ${(sumR(q) / q.length).toFixed(3)}R · total ${sumR(q).toFixed(2)}R · 2023 ${sumR(q.filter((x) => new Date(x.at).getUTCFullYear() === 2023)).toFixed(2)}R`);
  }
  for (const risk of RISKS) { const a = account(tsWide, risk, NEW); line("w50", curve(a, risk), a, ` · min-lot skips ${a.minLotSkips}`); }

  const yr = years.map((y) => y.r);
  const gap = holes.find(([a]) => a.startsWith("2019-12")) ?? holes[0];
  const year2023R = years.find((y) => y.year === 2023)?.r ?? 0;
  const out = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: `MT5 broker XAUUSD M15, ${monthKey(T0)} → ${monthKey(T1)}`,
    spread: SPREAD,
    start: START,
    stats: { trades: st.n, perWeek: r2(st.n / coveredWeeks), winRate: r2((100 * st.wins) / st.n), avgR: r3(sumR(ts) / st.n), profitFactor: r2(st.g / st.l), bestYearR: Math.max(...yr), worstYearR: Math.min(...yr) },
    years,
    risks,
    model: {
      positionCap: POSITION_CAP,
      swapPerOzNight: SWAP_PER_OZ_NIGHT,
      newsFilterFrom: dayKey(newsFrom),
      dataGap: gap ? [gap[0], gap[1]] : [],
      excluded: ["commission", "slippage beyond the next-bar open", "spread widening at news"],
    },
    outOfSample: {
      note: `Rules and settings were chosen on 2019–2022 broker history and checked on 2023 onward. 2023 itself lost ${Math.abs(year2023R).toFixed(2)}R; ${Math.round((100 * r2426) / totalR)}% of all R comes from 2024–2026.`,
      year2023R,
    },
  };
  mkdirSync(path.dirname(OUT), { recursive: true });
  const json = JSON.stringify(out);
  writeFileSync(OUT, json + "\n");
  console.log(`\nwrote ${OUT} (${(json.length / 1024).toFixed(1)} KB)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
