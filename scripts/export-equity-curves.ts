/**
 * Equity curves of the live system as deployed, for the site: src/data/backtest-curves.json.
 * Broker candles (JustMarkets XAUUSD, via scripts/broker-data.ts), machinery copied from scripts/exposure-cap-research.ts
 * (itself from scripts/xau-alpha-research.ts): daily / 4h scoreSeries aligned to CLOSED bars, daily ATR, entry at the
 * next bar's open ± $0.30 spread, stop checked first inside a bar, gaps fill at the open, trades crossing an M15 hole
 * > 4 days dropped, $1,500 account with overlapping positions, closed-balance DD, CAGR over the weeks the data covers.
 * Live system = the 3 session breakouts of src/lib/setup/sessionRules.ts (first breakout decides the day), conviction
 * sizing sizeFactor(D1, 4H), and half size when a same-direction session position is already open (mt5/XauBot.mq5
 * SAME_DIR_MUL; variant c1 of scripts/exposure-cap-research.ts).
 *   npx tsx --env-file=.env scripts/export-equity-curves.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { load } from "./broker-data";
import { alignClosed } from "../src/lib/bot/backtest";
import { atrSeries, type Candle } from "../src/lib/analysis/indicators";
import { scoreSeries } from "../src/lib/bot/strategy";
import { SESSION_RULES, sizeFactor, type SessionRule } from "../src/lib/setup/sessionRules";

const M15 = 15 * 6e4, H = 36e5, DAY = 864e5, WK = 7 * DAY, YR = 365.25 * DAY, HOLE = 4 * DAY;
const START = 1500, SPREAD = 0.3, SAME_DIR_MUL = 0.5, RISKS = [0.5, 1, 1.5, 2, 3];
const OUT = path.join(__dirname, "..", "src", "data", "backtest-curves.json");

// ───────────────────────────── data ─────────────────────────────
type Ctx = { m15: Candle[]; t: number[]; daily: (number | null)[]; four: (number | null)[]; atrD: number[] };
let CTX: Ctx;
const sgn = (x: number | null) => (x === null ? 0 : Math.sign(x));
const hourOf = (d: Date) => d.getUTCHours() + d.getUTCMinutes() / 60;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const monthKey = (ms: number) => new Date(ms).toISOString().slice(0, 7);

type Trade = { r: number; at: number; entryT: number; end: number; rule: string; side: number; d1: number; h4: number };

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
function ruleTrades(rule: SessionRule): Trade[] {
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
    done = true; // the first trend-agreeing breakout decides the day
    const mid = (hi + lo) / 2, R0 = Math.abs(b.close - mid);
    if (!(R0 >= rule.minStopAtr * CTX.atrD[i])) continue;
    if (rule.minDailyScore && Math.abs(d!) < rule.minDailyScore) continue;
    const nx = m15[i + 1];
    if (side * (nx.open - mid) <= 0) continue;
    const d0 = Date.parse(`${k}T00:00:00Z`), fri = new Date(d0).getUTCDay() === 5;
    const exitAt = rule.exit === "same20" || fri ? d0 + 20 * H : d0 + 31 * H;
    const entry = nx.open + side * SPREAD, risk = side * (entry - mid);
    if (!(risk > 0.2)) continue;
    const res = walk(i + 1, side, entry, mid, entry + side * rule.rr * risk, risk, exitAt);
    if (res) out.push({ r: res.r, at: t[i], entryT: t[i + 1], end: res.end, rule: rule.id, side, d1: d!, h4: f! });
  }
  return out;
}

// ───────────────────────────── account ─────────────────────────────
/** Closed-balance account, positions overlap; returns final balance, max DD and every balance change (time, balance). */
function account(ts: Trade[], pct: number) {
  let bal = START, pk = START, dd = 0;
  const open: { side: number; usd: number; end: number; r: number }[] = [], events: [number, number][] = [];
  const closeUntil = (tm: number) => {
    open.sort((a, b) => a.end - b.end);
    while (open.length && open[0].end <= tm) {
      const q = open.shift()!;
      bal += q.usd * q.r; pk = Math.max(pk, bal); dd = Math.max(dd, (100 * (pk - bal)) / pk);
      events.push([q.end, bal]);
    }
  };
  for (const x of ts) {
    closeUntil(x.entryT);
    const w = sizeFactor(x.d1, x.h4) * (open.some((o) => o.side === x.side) ? SAME_DIR_MUL : 1);
    open.push({ end: x.end, usd: (pct / 100) * bal * w, r: x.r, side: x.side });
  }
  closeUntil(Infinity);
  return { bal, dd, ret: (100 * (bal - START)) / START, events };
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

function main() {
  const m15 = load("m15", "EU").filter((b) => b.time.getUTCFullYear() >= 2019), h4 = load("h4", "EU"), d1 = load("d1", "EU");
  const dec = m15.map((c) => c.time.getTime() + M15);
  CTX = { m15, t: m15.map((c) => c.time.getTime()), daily: alignClosed(dec, d1, scoreSeries(d1), "1day"), four: alignClosed(dec, h4, scoreSeries(h4), "4h"), atrD: alignClosed(dec, d1, atrSeries(d1), "1day").map((x) => x ?? NaN) };
  const T0 = CTX.t[0], T1 = CTX.t.at(-1)!;
  // covered time = weeks with ≥ 300 M15 bars (a full week has ~460)
  const A0 = Date.UTC(2018, 11, 31), wk = new Map<number, number>();
  for (const x of CTX.t) { const k = Math.floor((x - A0) / WK); wk.set(k, (wk.get(k) ?? 0) + 1); }
  const coveredWeeks = [...wk.values()].filter((n) => n >= 300).length, coveredYears = (coveredWeeks * WK) / YR;
  const holes: string[] = [];
  for (let i = 1; i < CTX.t.length; i++) if (CTX.t[i] - CTX.t[i - 1] > HOLE) holes.push(`${dayKey(CTX.t[i - 1])} → ${dayKey(CTX.t[i])}`);
  console.log(`DATA: JustMarkets M15 ${dayKey(T0)} → ${dayKey(T1)} (${m15.length} bars), H4 ${h4.length}, D1 ${d1.length}. Covered weeks ${coveredWeeks} = ${coveredYears.toFixed(2)} yrs (calendar ${((T1 - T0) / YR).toFixed(2)}). Holes > 4 days: ${holes.join(", ") || "none"}`);
  const thin = [...wk].filter(([, n]) => n < 300).map(([k, n]) => `${dayKey(A0 + k * WK)}:${n}`);
  console.log(`  thin weeks (< 300 bars): ${thin.length} — ${thin.slice(0, 30).join(" ")}${thin.length > 30 ? " …" : ""}`);

  const ts = SESSION_RULES.flatMap(ruleTrades).sort((a, b) => a.entryT - b.entryT || a.at - b.at);
  const n = ts.length, wins = ts.filter((x) => x.r > 0).length;
  const g = ts.reduce((s, x) => s + Math.max(0, x.r), 0), l = ts.reduce((s, x) => s - Math.min(0, x.r), 0), sumR = ts.reduce((s, x) => s + x.r, 0);
  const byRule = SESSION_RULES.map((r) => { const q = ts.filter((x) => x.rule === r.id); return `${r.id} ${q.length} ${(q.reduce((s, x) => s + x.r, 0) / q.length).toFixed(3)}R`; });
  console.log(`TRADES: ${n} · win ${((100 * wins) / n).toFixed(1)}% · avg ${(sumR / n).toFixed(3)}R · PF ${(g / l).toFixed(2)} · ${byRule.join(" · ")}`);

  const years = [...new Set(ts.map((x) => new Date(x.at).getUTCFullYear()))].sort().map((y) => {
    const q = ts.filter((x) => new Date(x.at).getUTCFullYear() === y);
    return { year: y, trades: q.length, r: r2(q.reduce((s, x) => s + x.r, 0)), winRate: r2((100 * q.filter((x) => x.r > 0).length) / q.length) };
  });
  for (const y of years) console.log(`  ${y.year}: n ${y.trades} · ${y.r >= 0 ? "+" : ""}${y.r}R · win ${y.winRate}%`);

  // months from the first data month to the last
  const months: string[] = [];
  for (let d = new Date(Date.UTC(new Date(T0).getUTCFullYear(), new Date(T0).getUTCMonth(), 1)); d.getTime() <= T1; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(monthKey(d.getTime()));

  const risks = RISKS.map((risk) => {
    const a = account(ts, risk);
    let k = 0, bal = START;
    const monthly = months.map((m) => { while (k < a.events.length && monthKey(a.events[k][0]) <= m) bal = a.events[k++][1]; return { m, eq: Math.round(bal) }; });
    // month returns on exact balances
    k = 0; bal = START;
    const exact = months.map((m) => { while (k < a.events.length && monthKey(a.events[k][0]) <= m) bal = a.events[k++][1]; return bal; });
    const mret = exact.map((b, i) => (100 * b) / (i ? exact[i - 1] : START) - 100);
    const cagr = 100 * (Math.pow(a.bal / START, 1 / coveredYears) - 1);
    console.log(`RISK ${risk}%: final $${a.bal.toFixed(0)} (${a.ret >= 0 ? "+" : ""}${a.ret.toFixed(1)}%) · CAGR ${cagr.toFixed(2)}% · closed DD ${a.dd.toFixed(2)}% · months ${Math.min(...mret).toFixed(2)}% … +${Math.max(...mret).toFixed(2)}%`);
    return { risk, finalPct: r2(a.ret), cagr: r2(cagr), maxDD: r2(a.dd), worstMonth: r2(Math.min(...mret)), bestMonth: r2(Math.max(...mret)), monthly };
  });

  const yr = years.map((y) => y.r);
  const out = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: `JustMarkets XAUUSD M15, ${monthKey(T0)} → ${monthKey(T1)}`,
    spread: SPREAD,
    start: START,
    stats: { trades: n, perWeek: r2(n / coveredWeeks), winRate: r2((100 * wins) / n), avgR: r3(sumR / n), profitFactor: r2(g / l), bestYearR: Math.max(...yr), worstYearR: Math.min(...yr) },
    years,
    risks,
  };
  mkdirSync(path.dirname(OUT), { recursive: true });
  const json = JSON.stringify(out);
  writeFileSync(OUT, json + "\n");
  console.log(`wrote ${OUT} (${(json.length / 1024).toFixed(1)} KB)`);
}
main();
