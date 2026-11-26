/**
 * Can several session-range breakouts together give 3–5 good trades a week? Each session (Asian, London open,
 * New York open) gets the same kind of rule: the high/low of its opening range, the first close outside it in the
 * daily + 4-hour trend direction, stop at the middle, a fixed R target, a minimum range against the daily ATR.
 * Settings are picked per session on 2019–2022 only; the chosen set is then judged untouched on 2023 →.
 *   npx tsx scripts/session-portfolio-research.ts
 */
import { load } from "./broker-data";
import { alignClosed } from "../src/lib/bot/backtest";
import { atrSeries, type Candle } from "../src/lib/analysis/indicators";
import { scoreSeries } from "../src/lib/bot/strategy";

const M15 = 15 * 6e4, H = 36e5, SPREAD = 0.3, CUT = Date.UTC(2023, 0, 1);
const m15 = load("m15", "EU").filter((b) => b.time.getUTCFullYear() >= 2019), h4 = load("h4", "EU"), d1 = load("d1", "EU");
const dec = m15.map((c) => c.time.getTime() + M15);
const daily = alignClosed(dec, d1, scoreSeries(d1), "1day"), four = alignClosed(dec, h4, scoreSeries(h4), "4h");
const atrD = alignClosed(dec, d1, atrSeries(d1), "1day").map((x) => x ?? NaN);
const sgn = (x: number | null) => (x === null ? 0 : Math.sign(x));
const weeks = (m15.at(-1)!.time.getTime() - m15[0].time.getTime()) / (7 * 864e5);

type Rule = { name: string; rs: number; re: number; we: number; rr: number; k: number; trend: "both" | "daily"; exit: "same20" | "next07" };
type Trade = { r: number; at: number; end: number; rule: string };

function trades(rule: Rule): Trade[] {
  const out: Trade[] = [];
  let day = "", hi = -Infinity, lo = Infinity, n = 0, done = false;
  for (let i = 0; i < m15.length - 1; i++) {
    const b = m15[i], k = b.time.toISOString().slice(0, 10), h = b.time.getUTCHours() + b.time.getUTCMinutes() / 60;
    if (k !== day) { day = k; hi = -Infinity; lo = Infinity; n = 0; done = false; }
    if (h >= rule.rs && h < rule.re) { hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); n++; continue; }
    if (done || h < rule.re || h >= rule.we || n < Math.max(2, (rule.re - rule.rs) * 3)) continue;
    const side = b.close > hi ? 1 : b.close < lo ? -1 : 0;
    if (!side) continue;
    const d = sgn(daily[i]), f = sgn(four[i]);
    if (d !== side || (rule.trend === "both" && f !== side)) continue;
    done = true;
    const mid = (hi + lo) / 2;
    if (!(Math.abs(b.close - mid) >= rule.k * atrD[i])) continue;
    const entry = m15[i + 1].open + side * SPREAD, risk = side * (entry - mid);
    if (!(risk > 0.2)) continue;
    const target = entry + side * rule.rr * risk;
    const d0 = Date.parse(`${k}T00:00:00Z`), fri = new Date(d0).getUTCDay() === 5;
    const exitAt = rule.exit === "same20" || fri ? d0 + 20 * H : d0 + 31 * H;
    let r: number | null = null, end = exitAt;
    for (let j = i + 1; j < m15.length; j++) {
      const c = m15[j];
      if (c.time.getTime() >= exitAt) { r = (side * (c.open - entry)) / risk; end = c.time.getTime(); break; }
      if (side > 0 ? c.low <= mid : c.high >= mid) { r = -1; end = c.time.getTime() + M15; break; }
      if (side > 0 ? c.high >= target : c.low <= target) { r = rule.rr; end = c.time.getTime() + M15; break; }
    }
    if (r !== null) out.push({ r, at: b.time.getTime(), end, rule: rule.name });
  }
  return out;
}

const stats = (ts: Trade[], wk = weeks) => {
  let w = 0, g = 0, l = 0, s = 0, peak = 0, dd = 0;
  for (const t of [...ts].sort((a, b) => a.at - b.at)) { if (t.r > 0) { w++; g += t.r; } else l -= t.r; s += t.r; peak = Math.max(peak, s); dd = Math.max(dd, peak - s); }
  const nl = ts.length - w;
  return { n: ts.length, perWeek: ts.length / wk, win: ts.length ? (100 * w) / ts.length : 0, rr: w && nl ? g / w / (l / nl) : 0, avg: ts.length ? s / ts.length : 0, pf: l > 0 ? g / l : Infinity, dd, sum: s };
};
const f = (x: ReturnType<typeof stats>) => `${String(x.n).padStart(4)} tr ${x.perWeek.toFixed(2)}/wk ${x.win.toFixed(0).padStart(3)}% RR 1:${x.rr.toFixed(2)} avg ${(x.avg >= 0 ? "+" : "") + x.avg.toFixed(3)}R PF ${x.pf.toFixed(2)} DD ${x.dd.toFixed(1)}R`;
const isWeeks = (CUT - m15[0].time.getTime()) / (7 * 864e5), oosWeeks = weeks - isWeeks;
const halves = (ts: Trade[]) => [stats(ts.filter((t) => t.at < CUT), isWeeks), stats(ts.filter((t) => t.at >= CUT), oosWeeks)];

// The sessions and the settings tried for each (kept small on purpose).
const sessions: { name: string; rs: number; re: number; wes: number[] }[] = [
  { name: "Asia 00–07", rs: 0, re: 7, wes: [12, 16] },
  { name: "London 07–08", rs: 7, re: 8, wes: [11, 13] },
  { name: "London 07–09", rs: 7, re: 9, wes: [12, 14] },
  { name: "NY 12:30–13:30", rs: 12.5, re: 13.5, wes: [16, 18] },
  { name: "NY 13:30–14:30", rs: 13.5, re: 14.5, wes: [17, 19] },
];
const chosen: { rule: Rule; is: ReturnType<typeof stats>; oos: ReturnType<typeof stats> }[] = [];
for (const s of sessions) {
  console.log(`\n${s.name}`);
  let best: { rule: Rule; is: ReturnType<typeof stats>; oos: ReturnType<typeof stats> } | null = null;
  for (const we of s.wes) for (const rr of [2, 3]) for (const k of [0.1, 0.25]) for (const trend of ["both", "daily"] as const) for (const exit of ["same20", "next07"] as const) {
    const rule: Rule = { name: `${s.name} · to ${we}h · ${rr}R · k${k} · ${trend} · ${exit}`, rs: s.rs, re: s.re, we, rr, k, trend, exit };
    const [is, oos] = halves(trades(rule));
    // picked on 2019–22 only: the best average R among settings with at least 0.3 trades a week
    if (is.perWeek >= 0.3 && (!best || is.avg > best.is.avg)) best = { rule, is, oos };
  }
  if (best) {
    console.log(`  picked on 2019–22: ${best.rule.name}\n    2019–22 ${f(best.is)}\n    2023→   ${f(best.oos)}`);
    if (best.is.avg > 0.05 && best.is.pf >= 1.2) chosen.push(best);
  }
}

console.log("\nPORTFOLIO of the picks with 2019–22 PF ≥ 1.2 (each session trades on its own):");
const all = chosen.flatMap((c) => trades(c.rule));
const [pis, poos] = halves(all);
console.log(`  2019–22 ${f(pis)}\n  2023→   ${f(poos)}\n  all     ${f(stats(all))}`);
// One position at a time: a trade is skipped while another is still open.
const one: Trade[] = [];
let busyUntil = 0;
for (const t of [...all].sort((a, b) => a.at - b.at)) if (t.at >= busyUntil) { one.push(t); busyUntil = t.end; }
const [ois, ooos] = halves(one);
console.log("ONE POSITION AT A TIME:");
console.log(`  2019–22 ${f(ois)}\n  2023→   ${f(ooos)}\n  all     ${f(stats(one))}`);
for (const y of [...new Set(all.map((t) => new Date(t.at).getUTCFullYear()))]) {
  const ys = all.filter((t) => new Date(t.at).getUTCFullYear() === y);
  console.log(`  ${y}: ${f(stats(ys, 52))}`);
}
