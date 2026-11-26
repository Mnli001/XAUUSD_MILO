/**
 * The setup catalogue (docs/bot-plan.html) replayed on the broker's history 2019 →: each setup is built from
 * fixed rules, with and without its confirmations, chosen on 2019–2022 and judged untouched on 2023 →.
 *   npx tsx --env-file=.env scripts/setup-catalog-research.ts
 */
import { load } from "./broker-data";
import { alignClosed, simulateOrders, type Order } from "../src/lib/bot/backtest";
import { atrSeries, ema, type Candle } from "../src/lib/analysis/indicators";
import { DEFAULT_PARAMS, scoreSeries } from "../src/lib/bot/strategy";
import { asianRangeOrders, ASIAN_MIN_STOP_ATR } from "../src/lib/bot/ideas";

const M15 = 15 * 6e4;
const m15 = load("m15", "EU").filter((b) => b.time.getUTCFullYear() >= 2019), h1 = load("m15", "EU"), h4 = load("h4", "EU"), d1 = load("d1", "EU");
void h1;
const dec = m15.map((c) => c.time.getTime() + M15);
const daily = alignClosed(dec, d1, scoreSeries(d1), "1day"), four = alignClosed(dec, h4, scoreSeries(h4), "4h");
const atrD = alignClosed(dec, d1, atrSeries(d1), "1day").map((x) => x ?? NaN);
const atr15 = atrSeries(m15);
const ema50 = ema(m15.map((c) => c.close), 200); // 200 × 15 min ≈ the 1-hour EMA50
const params = { ...DEFAULT_PARAMS, breakeven: false, maxTradesPerDay: 3 };
const dir = (s: number | null) => (s === null ? 0 : s > 0 ? 1 : s < 0 ? -1 : 0);
const utcH = (b: Candle) => b.time.getUTCHours() + b.time.getUTCMinutes() / 60;
const dayKey = (b: Candle) => b.time.toISOString().slice(0, 10);
const barsTo20 = (i: number) => { const b = m15[i].time; const end = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 20); return Math.floor((end - (b.getTime() + M15)) / M15); };

/** Per-day facts: the Asian range (00–07 UTC), yesterday's high, low and middle. */
type Day = { aHi: number; aLo: number; aN: number; pdh: number; pdl: number; open7: number | null; done: Set<string> };
const days = new Map<string, Day>();
{
  let prev: { hi: number; lo: number } | null = null, cur: { hi: number; lo: number } | null = null, key = "";
  for (const b of m15) {
    const k = dayKey(b);
    if (k !== key) { if (cur) prev = cur; cur = { hi: -Infinity, lo: Infinity }; key = k; days.set(k, { aHi: -Infinity, aLo: Infinity, aN: 0, pdh: prev?.hi ?? NaN, pdl: prev?.lo ?? NaN, open7: null, done: new Set() }); }
    const d = days.get(k)!;
    cur!.hi = Math.max(cur!.hi, b.high); cur!.lo = Math.min(cur!.lo, b.low);
    if (b.time.getUTCHours() < 7) { d.aHi = Math.max(d.aHi, b.high); d.aLo = Math.min(d.aLo, b.low); d.aN++; }
    if (b.time.getUTCHours() === 7 && b.time.getUTCMinutes() === 0) d.open7 = b.open;
  }
}

type Opt = { rr: number; trend: "none" | "daily" | "both"; target?: "rr" | "level" };
const trendOk = (i: number, side: number, t: Opt["trend"]) => t === "none" || (t === "daily" ? dir(daily[i]) === side : dir(daily[i]) === side && dir(four[i]) === side);
const order = (side: number, stop: number, target: number, i: number): Order | null => {
  const e = m15[i].close, sd = Math.abs(e - stop), td = Math.abs(target - e), mb = barsTo20(i);
  if (!(sd > 0) || !(td > 0) || mb < 1 || sd < 0.1 * (atrD[i] || Infinity)) return null;
  return { side: side > 0 ? "BUY" : "SELL", stopDist: sd, targetDist: td, maxBars: mb };
};

/** 2. London sweep: 07–10 UTC price runs an Asian edge and closes back inside, then a close beyond the last 4 bars' extreme (the shift). */
function londonSweep(o: Opt): (Order | null)[] {
  for (const d of days.values()) d.done.clear();
  const out: (Order | null)[] = new Array(m15.length).fill(null);
  let pend: { side: number; ext: number; lvl: number; until: number; k: string } | null = null;
  m15.forEach((b, i) => {
    const d = days.get(dayKey(b))!, h = utcH(b);
    if (d.aN < 20 || d.done.has("ls") || h < 7 || h >= 12) { pend = null; return; }
    if (pend && pend.k === dayKey(b) && i <= pend.until) {
      const p = pend;
      p.ext = p.side < 0 ? Math.max(p.ext, b.high) : Math.min(p.ext, b.low);
      if (p.side < 0 ? b.close < p.lvl : b.close > p.lvl) {
        if (trendOk(i, p.side, o.trend)) {
          const stop = p.ext + p.side * -0.1 * atr15[i];
          const target = o.target === "level" ? (p.side < 0 ? d.aLo : d.aHi) : b.close + p.side * o.rr * Math.abs(b.close - stop);
          out[i] = order(p.side, stop, target, i);
        }
        d.done.add("ls"); pend = null;
      }
      return;
    }
    if (h >= 10) return;
    const lows = Math.min(...m15.slice(Math.max(0, i - 4), i).map((x) => x.low)), highs = Math.max(...m15.slice(Math.max(0, i - 4), i).map((x) => x.high));
    if (b.high > d.aHi && b.close < d.aHi) pend = { side: -1, ext: b.high, lvl: lows, until: i + 8, k: dayKey(b) };
    else if (b.low < d.aLo && b.close > d.aLo) pend = { side: 1, ext: b.low, lvl: highs, until: i + 8, k: dayKey(b) };
  });
  return out;
}

/** 3. NY continuation: London moved ≥ 0.5 daily ATR; 13:30–16:00 UTC a pullback of 38–62% then a close back with the move. */
function nyContinuation(o: Opt): (Order | null)[] {
  for (const d of days.values()) d.done.clear();
  const out: (Order | null)[] = new Array(m15.length).fill(null);
  const state = new Map<string, { side: number; hi: number; lo: number; touched: boolean; pull: number }>();
  m15.forEach((b, i) => {
    const k = dayKey(b), d = days.get(k)!, h = utcH(b);
    if (h < 7 || d.open7 === null) return;
    if (h < 13.5) { const s = state.get(k) ?? { side: 0, hi: -Infinity, lo: Infinity, touched: false, pull: NaN }; s.hi = Math.max(s.hi, b.high); s.lo = Math.min(s.lo, b.low); state.set(k, s); return; }
    const s = state.get(k);
    if (!s || h >= 16 || d.done.has("ny")) return;
    if (s.side === 0) {
      const move = m15[i - 1].close - d.open7;
      if (Math.abs(move) < 0.5 * atrD[i]) { d.done.add("ny"); return; }
      s.side = Math.sign(move);
    }
    const leg = s.hi - s.lo, z1 = s.side > 0 ? s.hi - 0.382 * leg : s.lo + 0.382 * leg, z2 = s.side > 0 ? s.hi - 0.618 * leg : s.lo + 0.618 * leg;
    if (!s.touched && (s.side > 0 ? b.low <= z1 : b.high >= z1)) { s.touched = true; s.pull = s.side > 0 ? b.low : b.high; }
    if (s.touched) {
      s.pull = s.side > 0 ? Math.min(s.pull, b.low) : Math.max(s.pull, b.high);
      if (s.side > 0 ? s.pull < z2 - 0.1 * leg : s.pull > z2 + 0.1 * leg) { d.done.add("ny"); return; } // too deep: the move failed
      const back = s.side > 0 ? b.close > b.open && b.close > m15[i - 1].high : b.close < b.open && b.close < m15[i - 1].low;
      if (back) {
        if (trendOk(i, s.side, o.trend)) {
          const stop = s.pull - s.side * 0.1 * atr15[i];
          const target = o.target === "level" ? (s.side > 0 ? s.hi : s.lo) + s.side * 0.0 : b.close + s.side * o.rr * Math.abs(b.close - stop);
          out[i] = order(s.side, stop, target, i);
        }
        d.done.add("ny");
      }
    }
  });
  return out;
}

/** 4. Yesterday's high/low swept: 07–18 UTC a bar runs PDH (PDL) and closes back, then within 4 bars a close beyond its other end. */
function pdSweep(o: Opt): (Order | null)[] {
  for (const d of days.values()) d.done.clear();
  const out: (Order | null)[] = new Array(m15.length).fill(null);
  let pend: { side: number; ext: number; lvl: number; until: number } | null = null;
  m15.forEach((b, i) => {
    const d = days.get(dayKey(b))!, h = utcH(b);
    if (!Number.isFinite(d.pdh) || d.done.has("pd") || h < 7 || h >= 18) { pend = null; return; }
    if (pend && i <= pend.until) {
      pend.ext = pend.side < 0 ? Math.max(pend.ext, b.high) : Math.min(pend.ext, b.low);
      if (pend.side < 0 ? b.close < pend.lvl : b.close > pend.lvl) {
        if (o.trend === "none" || dir(four[i]) !== -pend.side) {
          const stop = pend.ext - pend.side * 0.1 * atr15[i];
          const target = o.target === "level" ? (d.pdh + d.pdl) / 2 : b.close + pend.side * o.rr * Math.abs(b.close - stop);
          out[i] = order(pend.side, stop, target, i);
        }
        d.done.add("pd"); pend = null;
      }
      return;
    }
    if (b.high > d.pdh && b.close < d.pdh && b.high - d.pdh <= 0.3 * atrD[i]) pend = { side: -1, ext: b.high, lvl: b.low, until: i + 4 };
    else if (b.low < d.pdl && b.close > d.pdl && d.pdl - b.low <= 0.3 * atrD[i]) pend = { side: 1, ext: b.low, lvl: b.high, until: i + 4 };
  });
  return out;
}

/** 5. Trend pullback: daily and 4-hour agree; 07–18 UTC price dips to the 1-hour EMA50 and a bar closes back above it, bullish (mirror for SELL). */
function pullback(o: Opt): (Order | null)[] {
  for (const d of days.values()) d.done.clear();
  const out: (Order | null)[] = new Array(m15.length).fill(null);
  m15.forEach((b, i) => {
    const d = days.get(dayKey(b))!, h = utcH(b), e = ema50[i];
    if (i < 300 || !Number.isFinite(e) || d.done.has("pb") || h < 7 || h >= 18) return;
    const side = dir(daily[i]);
    if (side === 0 || !trendOk(i, side, o.trend === "none" ? "daily" : o.trend)) return;
    const was = m15.slice(i - 12, i - 4).every((x) => (side > 0 ? x.low > e : x.high < e)); // it had been away from the line
    const touch = side > 0 ? b.low <= e && b.close > e && b.close > b.open : b.high >= e && b.close < e && b.close < b.open;
    if (!was || !touch) return;
    const swing = side > 0 ? Math.min(...m15.slice(i - 3, i + 1).map((x) => x.low)) : Math.max(...m15.slice(i - 3, i + 1).map((x) => x.high));
    const stop = swing - side * 0.1 * atr15[i];
    out[i] = order(side, stop, b.close + side * o.rr * Math.abs(b.close - stop), i);
    d.done.add("pb");
  });
  return out;
}

type T = { r: number; openedAt: Date };
const stats = (ts: T[]) => {
  let w = 0, g = 0, l = 0, s = 0, peak = 0, dd = 0;
  for (const t of ts) { if (t.r > 0) { w++; g += t.r; } else l -= t.r; s += t.r; peak = Math.max(peak, s); dd = Math.max(dd, peak - s); }
  const nl = ts.length - w;
  return { n: ts.length, win: ts.length ? (100 * w) / ts.length : 0, avg: ts.length ? s / ts.length : 0, pf: l > 0 ? g / l : Infinity, dd, rr: w && nl && l ? g / w / (l / nl) : 0 };
};
const f = (x: ReturnType<typeof stats>) => `${String(x.n).padStart(4)} tr ${x.win.toFixed(0).padStart(3)}% RR 1:${x.rr.toFixed(2)} avg ${(x.avg >= 0 ? "+" : "") + x.avg.toFixed(3)}R PF ${x.pf.toFixed(2)} DD ${x.dd.toFixed(1)}R`;
const CUT = Date.UTC(2023, 0, 1);
const run = (orders: (Order | null)[]) => simulateOrders(m15, orders, params, 1_000_000).trades as T[];
const rows: { name: string; a: ReturnType<typeof stats>; b: ReturnType<typeof stats>; ts: T[] }[] = [];
const show = (name: string, orders: (Order | null)[]) => {
  const ts = run(orders), a = stats(ts.filter((t) => t.openedAt.getTime() < CUT)), b = stats(ts.filter((t) => t.openedAt.getTime() >= CUT));
  rows.push({ name, a, b, ts });
  console.log(`${name.padEnd(42)} 2019–22: ${f(a)}  |  2023→: ${f(b)}`);
};

console.log(`broker 15m ${m15[0].time.toISOString().slice(0, 10)} → ${m15.at(-1)!.time.toISOString().slice(0, 10)}\n`);
show("1 Asian breakout (live rule)", asianRangeOrders(m15, { rr: 3, news: [], params, trend: daily, confirm: four, minStop: { atr: atrD, k: ASIAN_MIN_STOP_ATR } }));
for (const trend of ["none", "daily", "both"] as const) for (const t of [{ rr: 2 }, { rr: 3 }, { rr: 0, target: "level" as const }]) {
  const opt = { trend, ...t };
  const lab = `${t.target === "level" ? "TP level" : `${t.rr}R`}, trend ${trend}`;
  show(`2 London sweep · ${lab}`, londonSweep(opt));
  show(`3 NY continuation · ${lab}`, nyContinuation(opt));
  show(`4 PDH/PDL sweep · ${lab}`, pdSweep(opt));
  if (trend !== "none") show(`5 Trend pullback · ${lab}`, pullback(opt));
}
console.log("\nPASSED (both periods: ≥ 60 trades, avg ≥ +0.10R, PF ≥ 1.25):");
for (const r of rows) if (r.a.n >= 60 && r.b.n >= 60 && r.a.avg >= 0.1 && r.b.avg >= 0.1 && r.a.pf >= 1.25 && r.b.pf >= 1.25) {
  console.log(`  ${r.name}`);
  for (const y of [...new Set(r.ts.map((t) => t.openedAt.getUTCFullYear()))]) console.log(`     ${y}: ${f(stats(r.ts.filter((t) => t.openedAt.getUTCFullYear() === y)))}`);
}
