/**
 * The three session rules together, with ways to skip choppy markets and to let winners run.
 * Broker history 2019 →; each change is judged on 2019–2022 and, untouched, on 2023 →.
 *   npx tsx scripts/system-improve-research.ts
 */
import { load } from "./broker-data";
import { alignClosed } from "../src/lib/bot/backtest";
import { atrSeries, ema, type Candle } from "../src/lib/analysis/indicators";
import { scoreSeries } from "../src/lib/bot/strategy";
import { SESSION_RULES, type SessionRule } from "../src/lib/setup/sessionRules";

const M15 = 15 * 6e4, H = 36e5, SPREAD = 0.3, CUT = Date.UTC(2023, 0, 1);
const m15 = load("m15", "EU").filter((b) => b.time.getUTCFullYear() >= 2019), h4 = load("h4", "EU"), d1 = load("d1", "EU");
const dec = m15.map((c) => c.time.getTime() + M15);
const daily = alignClosed(dec, d1, scoreSeries(d1), "1day"), four = alignClosed(dec, h4, scoreSeries(h4), "4h");
const atrDs = atrSeries(d1), atrD = alignClosed(dec, d1, atrDs, "1day").map((x) => x ?? NaN);
const atr15 = atrSeries(m15);

/** Wilder ADX(14) on daily candles. */
function adx(c: Candle[], n = 14): number[] {
  const out = new Array(c.length).fill(NaN);
  let tr = 0, pdm = 0, ndm = 0, adxv = 0;
  const dxs: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const up = c[i].high - c[i - 1].high, dn = c[i - 1].low - c[i].low;
    const t = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
    if (i <= n) { tr += t; pdm += p; ndm += m; if (i < n) continue; }
    else { tr = tr - tr / n + t; pdm = pdm - pdm / n + p; ndm = ndm - ndm / n + m; }
    const pdi = (100 * pdm) / tr, ndi = (100 * ndm) / tr, dx = (100 * Math.abs(pdi - ndi)) / (pdi + ndi || 1);
    dxs.push(dx);
    if (dxs.length === n) adxv = dxs.reduce((a, b) => a + b, 0) / n;
    else if (dxs.length > n) adxv = (adxv * (n - 1) + dx) / n;
    if (dxs.length >= n) out[i] = adxv;
  }
  return out;
}
const adxD = alignClosed(dec, d1, adx(d1), "1day").map((x) => x ?? NaN);
// Weekly candles from the daily ones, and their trend score.
const wk: Candle[] = [];
for (const c of d1) {
  const t = c.time.getTime(), monday = t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5, k = Math.floor(monday / 864e5) * 864e5;
  const last = wk.at(-1);
  if (last && last.time.getTime() === k) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; }
  else wk.push({ time: new Date(k), open: c.open, high: c.high, low: c.low, close: c.close });
}
// A week's score is known only once the week has closed (its Monday + 7 days): no peeking at the current week.
const wkScore = scoreSeries(wk);
const weekly: (number | null)[] = [];
{
  let j = -1;
  for (const t of dec) { while (j + 1 < wk.length && wk[j + 1].time.getTime() + 7 * 864e5 <= t) j++; weekly.push(j >= 0 ? wkScore[j] : null); }
}
const e50d = alignClosed(dec, d1, ema(d1.map((c) => c.close), 50), "1day").map((x) => x ?? NaN);
const sgn = (x: number | null) => (x === null ? 0 : Math.sign(x));

type Filter = (i: number, side: number) => boolean;
type Exit = { trail: null | { start: number; dist: number } }; // trail: once +start R, stop follows `dist` R behind the best price
type Trade = { r: number; at: number };

function trades(rule: SessionRule, ok: Filter, exit: Exit): Trade[] {
  const out: Trade[] = [];
  let day = "", hi = -Infinity, lo = Infinity, n = 0, done = false;
  for (let i = 0; i < m15.length - 1; i++) {
    const b = m15[i], k = b.time.toISOString().slice(0, 10), h = b.time.getUTCHours() + b.time.getUTCMinutes() / 60;
    if (k !== day) { day = k; hi = -Infinity; lo = Infinity; n = 0; done = false; }
    if (h >= rule.rangeFrom && h < rule.rangeTo) { hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); n++; continue; }
    if (done || h < rule.rangeTo || h >= rule.entryTo || n < rule.minBars) continue;
    const side = b.close > hi ? 1 : b.close < lo ? -1 : 0;
    if (!side || sgn(daily[i]) !== side || sgn(four[i]) !== side) continue;
    done = true;
    const mid = (hi + lo) / 2;
    if (!(Math.abs(b.close - mid) >= rule.minStopAtr * atrD[i])) continue;
    if (!ok(i, side)) continue;
    const entry = m15[i + 1].open + side * SPREAD, risk = side * (entry - mid);
    if (!(risk > 0.2)) continue;
    const target = entry + side * rule.rr * risk;
    const d0 = Date.parse(`${k}T00:00:00Z`), fri = new Date(d0).getUTCDay() === 5;
    const exitAt = rule.exit === "same20" || fri ? d0 + 20 * H : d0 + 31 * H;
    let stop = mid, best = entry, r: number | null = null;
    for (let j = i + 1; j < m15.length; j++) {
      const c = m15[j];
      if (c.time.getTime() >= exitAt) { r = (side * (c.open - entry)) / risk; break; }
      if (side > 0 ? c.low <= stop : c.high >= stop) { r = (side * (stop - entry)) / risk; break; }
      if (side > 0 ? c.high >= target : c.low <= target) { r = rule.rr; break; }
      best = side > 0 ? Math.max(best, c.high) : Math.min(best, c.low);
      if (exit.trail && side * (best - entry) >= exit.trail.start * risk) {
        const s2 = best - side * exit.trail.dist * risk;
        if (side * (s2 - stop) > 0) stop = s2;
      }
    }
    if (r !== null) out.push({ r, at: b.time.getTime() });
  }
  return out;
}

const weeksOf = (a: number, b: number) => (b - a) / (7 * 864e5);
const t0 = m15[0].time.getTime(), t1 = m15.at(-1)!.time.getTime();
const stats = (ts: Trade[], wks: number) => {
  let w = 0, g = 0, l = 0, s = 0, peak = 0, dd = 0;
  for (const t of [...ts].sort((a, b) => a.at - b.at)) { if (t.r > 0) { w++; g += t.r; } else l -= t.r; s += t.r; peak = Math.max(peak, s); dd = Math.max(dd, peak - s); }
  const nl = ts.length - w;
  return { n: ts.length, pw: ts.length / wks, win: ts.length ? (100 * w) / ts.length : 0, rr: w && nl ? g / w / (l / nl) : 0, avg: ts.length ? s / ts.length : 0, pf: l > 0 ? g / l : Infinity, dd, sum: s };
};
const f = (x: ReturnType<typeof stats>) => `${String(x.n).padStart(4)} tr ${x.pw.toFixed(2)}/wk ${x.win.toFixed(0).padStart(3)}% RR 1:${x.rr.toFixed(2)} avg ${(x.avg >= 0 ? "+" : "") + x.avg.toFixed(3)}R PF ${x.pf.toFixed(2)} DD ${x.dd.toFixed(1)}R`;
const rows: { name: string; a: ReturnType<typeof stats>; b: ReturnType<typeof stats>; all: ReturnType<typeof stats>; years: Map<number, ReturnType<typeof stats>> }[] = [];
function run(name: string, ok: Filter = () => true, exit: Exit = { trail: null }) {
  const ts = SESSION_RULES.flatMap((r) => trades(r, ok, exit));
  const a = stats(ts.filter((t) => t.at < CUT), weeksOf(t0, CUT)), b = stats(ts.filter((t) => t.at >= CUT), weeksOf(CUT, t1));
  const years = new Map<number, ReturnType<typeof stats>>();
  for (const y of [...new Set(ts.map((t) => new Date(t.at).getUTCFullYear()))]) years.set(y, stats(ts.filter((t) => new Date(t.at).getUTCFullYear() === y), 52));
  rows.push({ name, a, b, all: stats(ts, weeksOf(t0, t1)), years });
  console.log(`${name.padEnd(38)} 2019–22: ${f(a)}  |  2023→: ${f(b)}`);
}

console.log(`broker ${new Date(t0).toISOString().slice(0, 10)} → ${new Date(t1).toISOString().slice(0, 10)}\n`);
run("the system now");
console.log("\nTREND STRENGTH");
for (const k of [18, 20, 22, 25]) run(`daily ADX ≥ ${k}`, (i) => adxD[i] >= k);
for (const k of [40, 60]) run(`|daily score| ≥ ${k}`, (i) => Math.abs(daily[i] ?? 0) >= k);
run("weekly trend agrees", (i, s) => sgn(weekly[i]) === s);
run("price beyond daily EMA50 by ≥ 1 ATR", (i, s) => s * (m15[i].close - e50d[i]) >= atrD[i]);
run("price beyond daily EMA50 by ≥ 0.5 ATR", (i, s) => s * (m15[i].close - e50d[i]) >= 0.5 * atrD[i]);
console.log("\nLET WINNERS RUN (trailing stop)");
run("trail 1R behind, from +1R", undefined, { trail: { start: 1, dist: 1 } });
run("trail 1R behind, from +1.5R", undefined, { trail: { start: 1.5, dist: 1 } });
run("trail 1.5R behind, from +2R", undefined, { trail: { start: 2, dist: 1.5 } });
console.log("\nHELD UP (better avg R than now in BOTH periods, ≥ 1 trade a week in each):");
const ref = rows[0];
for (const r of rows.slice(1)) if (r.a.avg > ref.a.avg && r.b.avg > ref.b.avg && r.a.pw >= 1 && r.b.pw >= 1) {
  console.log(`  ${r.name}: all ${f(r.all)}`);
  console.log(`     by year: ${[...r.years].map(([y, s]) => `${y} ${s.avg >= 0 ? "+" : ""}${s.avg.toFixed(2)}R/PF ${s.pf.toFixed(2)}`).join(" · ")}`);
}
console.log(`  (now by year: ${[...ref.years].map(([y, s]) => `${y} ${s.avg >= 0 ? "+" : ""}${s.avg.toFixed(2)}R/PF ${s.pf.toFixed(2)}`).join(" · ")})`);
void atr15;
