/**
 * Alpha research next to the live three session breakouts (broker candles, JustMarkets, 2019 → ; 2019–2022 in-sample,
 * 2023 → out-of-sample), at two cost levels. Machinery as in scripts/improve-7-research.ts and
 * scripts/daytime-setups-research.ts: daily / 4h scoreSeries aligned to CLOSED bars, daily ATR, entry at the next
 * bar's open ± spread, stop checked first inside a bar, gaps fill at the open, random-side null test, $1,500 account
 * with overlapping positions, DD on the closed-trade balance (mark-to-market DD reported where cheap).
 *   1)  xau-h4-swing          4H Donchian breakout with the daily score, chandelier / N/2 Donchian exit, swap paid
 *   2A) london-fakeout        Asian 00–07 range, 07–12 wick out & close back in → fade, only in a weak daily trend
 *   2B) trend-pullback        07–16, strong daily & 4h trend, 15m bar touches EMA20/50 and closes back → with trend
 *   3)  sizing on the current three: overlap scaling, conviction sizing, drawdown throttle — at equal max DD
 *   4)  cost stress: ny-late overnight (rollover spread + swap) vs flat 20:00; adverse-open skip; 0.3R slip rule
 *   npx tsx --env-file=.env scripts/xau-alpha-research.ts
 */
import { load } from "./broker-data";
import { alignClosed } from "../src/lib/bot/backtest";
import { atrSeries, ema, type Candle } from "../src/lib/analysis/indicators";
import { scoreSeries } from "../src/lib/bot/strategy";
import { SESSION_RULES, type SessionRule } from "../src/lib/setup/sessionRules";

const M15 = 15 * 6e4, H = 36e5, H4 = 4 * H, DAY = 864e5, WK = 7 * DAY, YR = 365.25 * DAY, CUT = Date.UTC(2023, 0, 1);
const START = 1500, MIN_N = 30, SEEDS = 500, DD_TARGETS = [11.1, 15.0];
type Cost = { spread: number; swap: number; label: string };
/** Cost levels: spread $0.30 with swap $0.20/oz/night, spread $0.50 with swap $0.40 (Wednesday night ×3, both sides a cost). */
const COSTS: Cost[] = [{ spread: 0.3, swap: 0.2, label: "sp0.30/sw0.20" }, { spread: 0.5, swap: 0.4, label: "sp0.50/sw0.40" }];

// ───────────────────────────── data ─────────────────────────────
type Ctx = {
  m15: Candle[]; t: number[]; daily: (number | null)[]; four: (number | null)[]; atrD: number[]; e20: number[]; e50: number[];
  h4: Candle[]; h4t: number[]; h4atr: number[]; h4daily: (number | null)[]; h4four: (number | null)[];
};
function makeCtx(m15: Candle[], h4: Candle[], d1: Candle[]): Ctx {
  const dec = m15.map((c) => c.time.getTime() + M15), sd = scoreSeries(d1), s4 = scoreSeries(h4);
  const closes = m15.map((c) => c.close), h4t = h4.map((c) => c.time.getTime());
  return {
    m15, t: m15.map((c) => c.time.getTime()),
    daily: alignClosed(dec, d1, sd, "1day"), four: alignClosed(dec, h4, s4, "4h"),
    atrD: alignClosed(dec, d1, atrSeries(d1), "1day").map((x) => x ?? NaN),
    e20: ema(closes, 20), e50: ema(closes, 50),
    h4, h4t, h4atr: atrSeries(h4), h4four: s4,
    h4daily: alignClosed(h4t.map((x) => x + H4), d1, sd, "1day"),
  };
}
const sgn = (x: number | null) => (x === null ? 0 : Math.sign(x));
const hourOf = (d: Date) => d.getUTCHours() + d.getUTCMinutes() / 60;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
let T0 = 0, T1 = 0, CTX: Ctx, DROP_HOLES = true;
const HOLE = 4 * 864e5;
function idx15(ms: number) { let lo = 0, hi = CTX.t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (CTX.t[m] < ms) lo = m + 1; else hi = m; } return lo; }

// ── broker rollover: server midnight (EET/EEST, EU DST) = 22:00 UTC winter, 21:00 UTC summer ──
const lastSunday = (y: number, m: number) => { const d = new Date(Date.UTC(y, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
const euSummer = (ms: number) => { const y = new Date(ms).getUTCFullYear(); return ms >= lastSunday(y, 2) && ms < lastSunday(y, 9); };
/** Swap nights by the SERVER date that starts at the rollover: Tue, Wed, Fri, Sat ×1 (Sat = Friday night), Thu ×3 (Wednesday night), Sun/Mon 0. */
const ROLL: { t: number; mult: number }[] = [];
for (let d = Date.UTC(2018, 11, 1); d < Date.UTC(2027, 1, 1); d += DAY) {
  const t = d + (euSummer(d + 21 * H) ? 21 : 22) * H, wd = new Date(d + DAY).getUTCDay();
  ROLL.push({ t, mult: wd === 4 ? 3 : wd === 2 || wd === 3 || wd === 5 || wd === 6 ? 1 : 0 });
}
const nights = (from: number, to: number) => { let n = 0; for (const r of ROLL) { if (r.t >= to) break; if (r.t > from) n += r.mult; } return n; };
const crossesRoll = (from: number, to: number) => ROLL.some((r) => r.t > from && r.t < to && r.mult > 0);

type Trade = {
  r: number; at: number; entryT: number; end: number; rule: string; side: number; entry: number; risk: number;
  j0: number; tgtR: number; exitAt: number; d1: number; h4: number; j4?: number; nightsN?: number; wx?: number;
};

/** 15m bars from the entry bar: time exit at the open, then stop (first; a gap fills at the open), then target. */
function walk(j0: number, side: number, entry: number, stop: number, target: number, risk: number, exitAt: number) {
  const { m15, t } = CTX, R = (px: number) => (side * (px - entry)) / risk;
  for (let j = j0; j < m15.length; j++) {
    const c = m15[j];
    if (DROP_HOLES && j > j0 && t[j] - t[j - 1] > HOLE) return null; // the broker's M15 history has holes (Dec 2019 → Mar 2020): unknown outcome
    if (t[j] >= exitAt) return { r: R(c.open), end: t[j] };
    if (side > 0 ? c.low <= stop : c.high >= stop) return { r: R(side > 0 ? Math.min(stop, c.open) : Math.max(stop, c.open)), end: t[j] + M15 };
    if (side > 0 ? c.high >= target : c.low <= target) return { r: R(target), end: t[j] + M15 };
  }
  return null;
}

// ───────────────────────────── live session rules ─────────────────────────────
type LiveOpts = { nyLate20?: boolean; adverse?: number; slip?: number; delay?: number; gaps?: number[] };
function liveTrades(rule: SessionRule, spread: number, o: LiveOpts = {}): Trade[] {
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
    done = true;
    const mid = (hi + lo) / 2, R0 = Math.abs(b.close - mid);
    if (!(R0 >= rule.minStopAtr * CTX.atrD[i])) continue;
    if (rule.minDailyScore && Math.abs(d!) < rule.minDailyScore) continue;
    const dl = o.delay ?? 0;
    if (i + 1 + dl >= m15.length) continue;
    const nx = m15[i + 1 + dl];
    o.gaps?.push((side * (nx.open - b.close)) / R0);
    if (side * (nx.open - mid) <= 0) continue;
    if (o.slip !== undefined && (side * (nx.open + side * spread - b.close)) / R0 > o.slip) continue; // ran away in our favour
    if (o.adverse !== undefined && (side * (nx.open - b.close)) / R0 < -o.adverse) continue; // opened against us
    const d0 = Date.parse(`${k}T00:00:00Z`), fri = new Date(d0).getUTCDay() === 5;
    const same20 = rule.exit === "same20" || (o.nyLate20 && rule.id === "ny-late-breakout");
    const exitAt = same20 || fri ? d0 + 20 * H : d0 + 31 * H;
    const entry = nx.open + side * spread, risk = side * (entry - mid);
    if (!(risk > 0.2)) continue;
    const res = walk(i + 1 + dl, side, entry, mid, entry + side * rule.rr * risk, risk, exitAt);
    if (res) out.push({ r: res.r, at: t[i], entryT: t[i + 1 + dl], end: res.end, rule: rule.id, side, entry, risk, j0: i + 1 + dl, tgtR: rule.rr, exitAt, d1: d!, h4: f! });
  }
  return out;
}
const live = (spread: number, o: LiveOpts = {}) => SESSION_RULES.flatMap((r) => liveTrades(r, spread, o));
/** ny-late held over the rollover: rollover spread once + swap per night (Wed ×3), as R. */
const overnight = (ts: Trade[], roll: number, swap: number) => ts.map((x) => {
  if (x.rule !== "ny-late-breakout" || !crossesRoll(x.entryT, x.end)) return x;
  return { ...x, r: x.r - (roll + swap * nights(x.entryT, x.end)) / x.risk };
});

// ───────────────────────────── 1) xau-h4-swing ─────────────────────────────
type SP = { N: number; minD: number; k: number; exit: string };
const S_DIMS = { N: [18, 24, 36], minD: [0, 35, 50], k: [1.5, 2.0, 2.5], exit: ["ch2.5", "ch3", "ch3.5", "don"] };
/** 4H bars from the entry bar. Gap through the stop fills at the open; a stop touch is timed on the 15m bars inside. */
function walkSwing(j0: number, side: number, entry: number, stop0: number, risk: number, p: SP) {
  const { h4, h4t, h4atr } = CTX, R = (px: number) => (side * (px - entry)) / risk;
  let stop = stop0, ext = side > 0 ? -Infinity : Infinity;
  const m = p.exit.startsWith("ch") ? Number(p.exit.slice(2)) : 0, n2 = p.N / 2;
  for (let j = j0; j < h4.length; j++) {
    const c = h4[j];
    if (DROP_HOLES && j > j0 && h4t[j] - h4t[j - 1] > HOLE) return null;
    if (side > 0 ? c.open <= stop : c.open >= stop) return { r: R(c.open), end: h4t[j], bar: j };
    if (side > 0 ? c.low <= stop : c.high >= stop) {
      let end = h4t[j] + H4;
      for (let q = idx15(h4t[j]); q < CTX.t.length && CTX.t[q] < h4t[j] + H4; q++) if (side > 0 ? CTX.m15[q].low <= stop : CTX.m15[q].high >= stop) { end = CTX.t[q] + M15; break; }
      return { r: R(stop), end, bar: j };
    }
    ext = side > 0 ? Math.max(ext, c.high) : Math.min(ext, c.low);
    if (m) { const ch = ext - side * m * h4atr[j]; stop = side > 0 ? Math.max(stop, ch) : Math.min(stop, ch); }
    else if (j - n2 >= 0 && j + 1 < h4.length) {
      let ll = Infinity, hh = -Infinity;
      for (let q = j - n2; q < j; q++) { ll = Math.min(ll, h4[q].low); hh = Math.max(hh, h4[q].high); }
      if (side > 0 ? c.close < ll : c.close > hh) return { r: R(h4[j + 1].open), end: h4t[j + 1], bar: j + 1 };
    }
  }
  return null;
}
function swing(p: SP, c: Cost): Trade[] {
  const { h4, h4t, h4atr } = CTX, out: Trade[] = [];
  let busy = -1;
  for (let i = p.N; i < h4.length - 1; i++) {
    if (h4t[i] < T0 || i <= busy) continue;
    let hh = -Infinity, ll = Infinity;
    for (let q = i - p.N; q < i; q++) { hh = Math.max(hh, h4[q].high); ll = Math.min(ll, h4[q].low); }
    const side = h4[i].close > hh ? 1 : h4[i].close < ll ? -1 : 0;
    if (!side) continue;
    const d = CTX.h4daily[i];
    if (sgn(d) !== side || Math.abs(d!) < p.minD || !Number.isFinite(h4atr[i])) continue;
    const entry = h4[i + 1].open + side * c.spread, risk = p.k * h4atr[i];
    const res = walkSwing(i + 1, side, entry, entry - side * risk, risk, p);
    if (!res) break;
    const nn = nights(h4t[i + 1], res.end);
    out.push({ r: res.r - (c.swap * nn) / risk, at: h4t[i] + H4, entryT: h4t[i + 1], end: res.end, rule: "xau-h4-swing", side, entry, risk, j0: idx15(h4t[i + 1]), tgtR: 0, exitAt: 0, d1: d!, h4: CTX.h4four[i] ?? 0, j4: i + 1, nightsN: nn });
    busy = res.bar - 1;
  }
  return out;
}

// ───────────────────────────── 2A) london fakeout reversion ─────────────────────────────
type FP = { maxD: number; tp: number | string };
const F_DIMS = { maxD: [25, 35, 50], tp: [1.5, 2, "mid"] };
function fakeout(p: FP, c: Cost): Trade[] {
  const { m15, t } = CTX, out: Trade[] = [];
  let day = "", hi = -Infinity, lo = Infinity, n = 0, done = false;
  for (let i = 0; i < m15.length - 1; i++) {
    const b = m15[i], k = dayKey(t[i]);
    if (k !== day) { day = k; hi = -Infinity; lo = Infinity; n = 0; done = false; }
    const h = hourOf(b.time);
    if (h < 7) { hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); n++; continue; }
    if (done || h >= 12 || n < 20) continue;
    const up = b.high > hi && b.close < hi && b.close > lo, dn = b.low < lo && b.close > lo && b.close < hi;
    if (up === dn) continue;
    const side = up ? -1 : 1, d = CTX.daily[i];
    if (d === null || Math.abs(d) >= p.maxD) { done = true; continue; } // the daily score is fixed for the session
    const atr = CTX.atrD[i], stop = side < 0 ? b.high + 0.05 * atr : b.low - 0.05 * atr;
    const d0 = Date.parse(`${k}T00:00:00Z`), exitAt = d0 + 20 * H;
    const entry = m15[i + 1].open + side * c.spread, risk = side * (entry - stop);
    if (!(risk > 0.2)) continue;
    const tgtR = p.tp === "mid" ? (side * ((hi + lo) / 2 - entry)) / risk : Number(p.tp);
    if (!(tgtR >= 1)) continue;
    done = true;
    const res = walk(i + 1, side, entry, stop, entry + side * tgtR * risk, risk, exitAt);
    if (res) out.push({ r: res.r, at: t[i], entryT: t[i + 1], end: res.end, rule: "london-fakeout", side, entry, risk, j0: i + 1, tgtR, exitAt, d1: d, h4: CTX.four[i] ?? 0 });
  }
  return out;
}

// ───────────────────────────── 2B) intraday trend pullback ─────────────────────────────
type PP = { ema: number; rr: number };
const P_DIMS = { ema: [20, 50], rr: [2, 2.5, 3] };
function pullback(p: PP, c: Cost): Trade[] {
  const { m15, t } = CTX, out: Trade[] = [], E = p.ema === 20 ? CTX.e20 : CTX.e50;
  let day = "", done = false;
  for (let i = 0; i < m15.length - 1; i++) {
    const b = m15[i], k = dayKey(t[i]);
    if (k !== day) { day = k; done = false; }
    const h = hourOf(b.time);
    if (done || h < 7 || h >= 16) continue;
    const d = CTX.daily[i], f = CTX.four[i], e = E[i];
    if (d === null || f === null || !Number.isFinite(e)) continue;
    const side = Math.sign(d);
    if (Math.sign(f) !== side || Math.abs(d) < 50 || Math.abs(f) < 35) continue;
    if (!(side > 0 ? b.low <= e && b.close > e : b.high >= e && b.close < e)) continue;
    const stop = side > 0 ? b.low : b.high, exitAt = Date.parse(`${k}T00:00:00Z`) + 20 * H;
    const entry = m15[i + 1].open + side * c.spread, risk = side * (entry - stop);
    if (!(risk >= 0.2 * CTX.atrD[i]) || !(risk > 0.2)) continue;
    done = true;
    const res = walk(i + 1, side, entry, stop, entry + side * p.rr * risk, risk, exitAt);
    if (res) out.push({ r: res.r, at: t[i], entryT: t[i + 1], end: res.end, rule: "trend-pullback", side, entry, risk, j0: i + 1, tgtR: p.rr, exitAt, d1: d, h4: f });
  }
  return out;
}

// ───────────────────────────── metrics ─────────────────────────────
type St = { n: number; pw: number; win: number; avg: number; pf: number; dd: number; sum: number };
function stats(ts: Trade[], weeks: number): St {
  let w = 0, g = 0, l = 0, s = 0, pk = 0, dd = 0;
  for (const x of [...ts].sort((a, b) => a.end - b.end)) {
    if (x.r > 0) { w++; g += x.r; } else l -= x.r;
    s += x.r; pk = Math.max(pk, s); dd = Math.max(dd, pk - s);
  }
  return { n: ts.length, pw: ts.length / weeks, win: ts.length ? (100 * w) / ts.length : 0, avg: ts.length ? s / ts.length : 0, pf: l > 0 ? g / l : Infinity, dd, sum: s };
}
const split = (ts: Trade[]) => ({ a: stats(ts.filter((x) => x.at < CUT), (CUT - T0) / WK), b: stats(ts.filter((x) => x.at >= CUT), (T1 - CUT) / WK), all: stats(ts, (T1 - T0) / WK) });
const fx = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "inf");
const sR = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(3);
const pc = (x: number, d = 0) => (x >= 0 ? "+" : "") + x.toFixed(d) + "%";
const good = (s: St) => s.pf > 1.1 && s.avg > 0.05;
const cell = (s: St) => `${String(s.n).padStart(4)} ${fx(s.pw).padStart(4)} ${s.win.toFixed(0).padStart(3)}% ${sR(s.avg)} ${fx(s.pf).padStart(5)} ${s.dd.toFixed(1).padStart(5)}`;
const CELLH = "   n  /wk win%   avgR    PF  DD R";
function corr(a: number[], b: number[]) {
  const n = a.length; if (n < 3) return NaN;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let c = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return c / Math.sqrt(va * vb);
}

// ───────────────────────────── account ─────────────────────────────
type Sz = { w2?: number; w3?: number; conv?: { hi: number; lo: number; use4h: boolean }; thr?: number };
const CUR = new Set<string>(SESSION_RULES.map((r) => r.id));
function weight(x: Trade, open: { side: number }[], bal: number, pk: number, sz: Sz) {
  let w = x.wx ?? 1;
  if (sz.w2 !== undefined) { const n = open.filter((o) => o.side === x.side).length; w *= n === 0 ? 1 : n === 1 ? sz.w2 : sz.w3 ?? sz.w2; }
  if (sz.conv && CUR.has(x.rule)) {
    const a = Math.abs(x.d1), f = Math.abs(x.h4), u = sz.conv.use4h;
    if (a >= 65 && (!u || f >= 65)) w *= sz.conv.hi; else if (a < 35 || (u && f < 35)) w *= sz.conv.lo;
  }
  if (sz.thr && (100 * (pk - bal)) / pk > sz.thr) w *= 0.5;
  return w;
}
const byEntry = (ts: Trade[]) => [...ts].sort((a, b) => a.entryT - b.entryT || a.at - b.at);
/** Risk pct of the closed balance at each entry, positions overlap; DD on the closed-trade balance. */
function account(ts: Trade[], pct: number, sz: Sz = {}) {
  let bal = START, pk = START, dd = 0;
  const open: { end: number; usd: number; r: number; side: number }[] = [];
  const closeUntil = (tm: number) => {
    open.sort((a, b) => a.end - b.end);
    while (open.length && open[0].end <= tm) { const p = open.shift()!; bal += p.usd * p.r; pk = Math.max(pk, bal); dd = Math.max(dd, (100 * (pk - bal)) / pk); }
  };
  for (const x of byEntry(ts)) { closeUntil(x.entryT); open.push({ end: x.end, usd: (pct / 100) * bal * weight(x, open, bal, pk, sz), r: x.r, side: x.side }); }
  closeUntil(Infinity);
  return { ret: (100 * (bal - START)) / START, dd, bal };
}
/** The same account marked to market on every 15m close (open positions at the close price, swap only at the exit). */
function mtmDD(ts: Trade[], pct: number, sz: Sz = {}) {
  const { m15, t } = CTX, ev = byEntry(ts);
  let bal = START, pk = START, eqPk = START, mdd = 0, k = 0;
  let open: { x: Trade; usd: number }[] = [];
  const i0 = idx15(ev[0]?.entryT ?? 0);
  for (let b = i0; b < m15.length && (k < ev.length || open.length); b++) {
    const tb = t[b];
    const keep: typeof open = [];
    for (const o of open.sort((a, c) => a.x.end - c.x.end)) { if (o.x.end <= tb) { bal += o.usd * o.x.r; pk = Math.max(pk, bal); } else keep.push(o); }
    open = keep;
    while (k < ev.length && ev[k].entryT <= tb) { const x = ev[k++]; open.push({ x, usd: (pct / 100) * bal * weight(x, open.map((o) => o.x), bal, pk, sz) }); }
    let eq = bal;
    for (const o of open) eq += o.x.end <= tb + M15 ? o.usd * o.x.r : (o.usd * o.x.side * (m15[b].close - o.x.entry)) / o.x.risk;
    eqPk = Math.max(eqPk, eq); mdd = Math.max(mdd, (100 * (eqPk - eq)) / eqPk);
  }
  return mdd;
}
/** Base risk % at which the closed-balance max DD equals the target (bisection). */
function eqRisk(ts: Trade[], target: number, sz: Sz = {}) {
  let lo = 0.01, hi = 25;
  if (account(ts, hi, sz).dd < target) return hi;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (account(ts, m, sz).dd < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
type PerRes = { r1: { ret: number; dd: number }; eq: { pct: number; cagr: number; ret: number }[] };
/** Years of actual M15 coverage per period (weeks holding ≥ 300 bars; 2019 H1 and Jan–Mar 2020 are nearly empty in the export). */
let YEARS = [1, 1, 1];
const PERIODS = [["all", (x: Trade) => true, () => T1 - T0], ["IS 19–22", (x: Trade) => x.at < CUT, () => CUT - T0], ["OOS 23→", (x: Trade) => x.at >= CUT, () => T1 - CUT]] as const;
function evalAcc(ts: Trade[], sz: Sz = {}): PerRes[] {
  return PERIODS.map(([, f, len]) => {
    const q = ts.filter(f), r1 = account(q, 1, sz), yrs = YEARS[PERIODS.findIndex((x) => x[1] === f)];
    const eq = DD_TARGETS.map((d) => { const pct = eqRisk(q, d, sz), a = account(q, pct, sz); return { pct, ret: a.ret, cagr: 100 * (Math.pow(a.bal / START, 1 / yrs) - 1) }; });
    return { r1: { ret: r1.ret, dd: r1.dd }, eq };
  });
}

// ───────────────────────────── grid / plateau / null ─────────────────────────────
type Var<P> = { p: P; idx: number[]; name: string; per: (ReturnType<typeof split> & { ts: Trade[] })[]; robust: boolean; minAvg: number; nb: number; nbN: number };
function grid<P>(dims: Record<string, readonly (string | number)[]>, fn: (p: P, c: Cost) => Trade[], label: string): Var<P>[] {
  const keys = Object.keys(dims);
  let combos: number[][] = [[]];
  for (const k of keys) combos = combos.flatMap((c) => dims[k].map((_, j) => [...c, j]));
  const vars: Var<P>[] = combos.map((idx) => {
    const p = Object.fromEntries(keys.map((k, d) => [k, dims[k][idx[d]]])) as P;
    const per = COSTS.map((c) => { const ts = fn(p, c); return { ...split(ts), ts }; });
    const robust = per.every((q) => good(q.a) && good(q.b) && q.a.n >= MIN_N && q.b.n >= MIN_N);
    return { p, idx, name: keys.map((k, d) => `${k}=${dims[k][idx[d]]}`).join(" "), per, robust, minAvg: Math.min(...per.flatMap((q) => [q.a.avg, q.b.avg])), nb: 0, nbN: 0 };
  });
  for (const v of vars) {
    const nbs = vars.filter((u) => u !== v && u.idx.filter((x, d) => x !== v.idx[d]).length === 1 && u.idx.every((x, d) => Math.abs(x - v.idx[d]) <= 1));
    v.nb = nbs.filter((u) => u.robust).length; v.nbN = nbs.length;
  }
  console.log(`\n${label} — ${vars.length} cells · ** = PF > 1.1 and avg R > +0.05 in BOTH periods at BOTH cost levels, n ≥ ${MIN_N} per period · nb = robust neighbours / neighbours`);
  console.log(`${"cell".padEnd(36)} | ${COSTS.flatMap((c) => [`${c.label} · 2019–22`, `${c.label} · 2023→`]).map((x) => x.padEnd(CELLH.length)).join(" | ")} | nb`);
  console.log(`${"".padEnd(36)} | ${[CELLH, CELLH, CELLH, CELLH].join(" | ")} |`);
  for (const v of vars) console.log(`${((v.robust ? "** " : "   ") + v.name).padEnd(36)} | ${v.per.flatMap((q) => [cell(q.a), cell(q.b)]).join(" | ")} | ${v.nb}/${v.nbN}`);
  const nRob = vars.filter((v) => v.robust).length, nGoodAnyN = vars.filter((v) => v.per.every((q) => good(q.a) && good(q.b))).length;
  const pos = vars.filter((v) => v.per.every((q) => q.a.avg > 0 && q.b.avg > 0)).length;
  console.log(`  cells passing (robust): ${nRob} / ${vars.length} · good ignoring n: ${nGoodAnyN} / ${vars.length} · avg R > 0 in all four columns: ${pos} / ${vars.length}`);
  console.log(`  IS→OOS consistency (${COSTS[0].label}): corr of avg R across cells 19–22 vs 23→ = ${fx(corr(vars.map((v) => v.per[0].a.avg), vars.map((v) => v.per[0].b.avg)))}`);
  return vars;
}
function pick<P>(vars: Var<P>[]) {
  const rob = vars.filter((v) => v.robust);
  const pool = rob.length ? rob : vars.filter((v) => v.per.every((q) => q.a.n >= 10 && q.b.n >= 10));
  const v = [...(pool.length ? pool : vars)].sort((x, y) => y.nb - x.nb || y.minAvg - x.minAvg)[0];
  return { v, robust: v.robust, plateau: v.robust && v.nbN > 0 && v.nb >= Math.ceil(v.nbN / 2) };
}
function mulberry(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
type Resim = (x: Trade, side: number, c: Cost) => Trade | null;
const resim15: Resim = (x, side, c) => {
  const entry = CTX.m15[x.j0].open + side * c.spread, res = walk(x.j0, side, entry, entry - side * x.risk, entry + side * x.tgtR * x.risk, x.risk, x.exitAt);
  return res ? { ...x, side, entry, r: res.r, end: res.end } : null;
};
const resimSwing = (p: SP): Resim => (x, side, c) => {
  const entry = CTX.h4[x.j4!].open + side * c.spread, res = walkSwing(x.j4!, side, entry, entry - side * x.risk, x.risk, p);
  return res ? { ...x, side, entry, r: res.r - (c.swap * nights(x.entryT, res.end)) / x.risk, end: res.end } : null;
};
/** Same entries, same $ risk / target multiple / exits, side at random (500 seeds). p = share of seeds with avg R ≥ actual. */
function nullTest(ts: Trade[], c: Cost, rs: Resim) {
  const act = split(ts), av = { a: [] as number[], b: [] as number[], all: [] as number[] };
  for (let s = 1; s <= SEEDS; s++) {
    const rnd = mulberry(s * 7919);
    const q = split(ts.map((x) => rs(x, rnd() < 0.5 ? 1 : -1, c)).filter((x): x is Trade => !!x));
    for (const k of ["a", "b", "all"] as const) av[k].push(q[k].avg);
  }
  const flip = split(ts.map((x) => rs(x, -x.side, c)).filter((x): x is Trade => !!x));
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const p = (k: "a" | "b" | "all") => av[k].filter((y) => y >= act[k].avg).length / SEEDS;
  for (const k of ["a", "b", "all"] as const) console.log(`      ${(k === "a" ? "19–22" : k === "b" ? "23→" : "all").padEnd(5)} actual avg ${sR(act[k].avg)} PF ${fx(act[k].pf)} | random side: mean avg ${sR(mean(av[k]))}, p = ${p(k).toFixed(3)} | flipped: avg ${sR(flip[k].avg)} PF ${fx(flip[k].pf)}`);
  return { a: p("a"), b: p("b"), all: p("all") };
}
function dailyCorr(ref: Trade[], add: Trade[]) {
  const sum = (ts: Trade[]) => { const m = new Map<string, number>(); for (const x of ts) m.set(dayKey(x.end), (m.get(dayKey(x.end)) ?? 0) + x.r); return m; };
  const A = sum(ref), B = sum(add), days: string[] = [];
  for (let d = Date.parse(dayKey(T0)); d <= T1; d += DAY) { const wd = new Date(d).getUTCDay(); if (wd >= 1 && wd <= 5) days.push(dayKey(d)); }
  const both = [...B.keys()].filter((k) => A.has(k));
  const rAll = corr(days.map((k) => A.get(k) ?? 0), days.map((k) => B.get(k) ?? 0));
  console.log(`      daily-R correlation (by exit day) with the current 3: all weekdays incl. zeros r = ${fx(rAll)} · on ${both.length} shared days r = ${fx(corr(both.map((k) => A.get(k)!), both.map((k) => B.get(k)!)))}`);
  return rAll;
}
function years(ref: Trade[], add: Trade[], label: string) {
  const ys = Array.from({ length: 8 }, (_, i) => 2019 + i);
  const row = (n: string, ts: Trade[]) => console.log(`      ${n.padEnd(22)} ${ys.map((y) => { const q = ts.filter((x) => new Date(x.at).getUTCFullYear() === y); const s = q.reduce((a, x) => a + x.r, 0); return `${(s >= 0 ? "+" : "") + s.toFixed(1)}/${q.length}`.padStart(11); }).join(" ")}`);
  console.log(`      ${"R sum / trades".padEnd(22)} ${ys.map((y) => String(y).padStart(11)).join(" ")}`);
  row("current 3", ref); row(label, add);
}

// ───────────────────────────── tables ─────────────────────────────
type Cfg = { name: string; ts: Trade[][]; sz?: Sz }; // ts per cost level
function accTable(title: string, cfgs: Cfg[], withMtm = false) {
  for (const [ci, c] of COSTS.entries()) {
    console.log(`\n${title} — ${c.label}  (1% = $1,500 at 1 % of the closed balance; eqDD = base risk % at which max closed-balance DD = ${DD_TARGETS.join("% / ")}%)`);
    const res = cfgs.map((g) => ({ g, e: evalAcc(g.ts[ci], g.sz) }));
    for (const [pi, [pname]] of PERIODS.entries()) {
      console.log(`  ${pname.padEnd(46)} |  n   | @1%  ret%     DD%  ret/DD | @DD 11.1%: risk%  CAGR%   total% | @DD 15%: risk%  CAGR%   total%${withMtm && pi === 0 ? " | MTM DD @1% / @eq11.1" : ""}`);
      for (const { g, e } of res) {
        const q = e[pi], n = g.ts[ci].filter(PERIODS[pi][1]).length;
        const eqs = q.eq.map((x) => `${x.pct.toFixed(2).padStart(6)} ${x.cagr.toFixed(1).padStart(6)} ${pc(x.ret).padStart(8)}`).join(" |         ");
        const mt = withMtm && pi === 0 ? ` | ${mtmDD(g.ts[ci], 1, g.sz).toFixed(1).padStart(5)}% / ${mtmDD(g.ts[ci], q.eq[0].pct, g.sz).toFixed(1)}%` : "";
        console.log(`  ${g.name.padEnd(46)} | ${String(n).padStart(4)} | ${pc(q.r1.ret).padStart(8)} ${q.r1.dd.toFixed(1).padStart(6)}% ${fx(q.r1.ret / q.r1.dd, 1).padStart(6)} |       ${eqs}${mt}`);
      }
    }
  }
}
/** A change passes when its equal-DD return beats the baseline's in IS AND OOS, at BOTH DD targets and BOTH cost levels. */
function beats(base: Cfg, alt: Cfg) {
  let ok = true; const gains: string[] = [];
  for (const ci of COSTS.keys()) {
    const b = evalAcc(base.ts[ci], base.sz), a = evalAcc(alt.ts[ci], alt.sz);
    for (const pi of [1, 2]) for (const di of DD_TARGETS.keys()) { if (!(a[pi].eq[di].cagr > b[pi].eq[di].cagr)) ok = false; }
    gains.push(`${COSTS[ci].label}: IS CAGR@11.1 ${b[1].eq[0].cagr.toFixed(1)}→${a[1].eq[0].cagr.toFixed(1)}, OOS ${b[2].eq[0].cagr.toFixed(1)}→${a[2].eq[0].cagr.toFixed(1)}; @15 IS ${b[1].eq[1].cagr.toFixed(1)}→${a[1].eq[1].cagr.toFixed(1)}, OOS ${b[2].eq[1].cagr.toFixed(1)}→${a[2].eq[1].cagr.toFixed(1)}`);
  }
  return { ok, txt: gains.join(" · ") };
}

// ───────────────────────────── main ─────────────────────────────
function main() {
  const m15 = load("m15", "EU").filter((b) => b.time.getUTCFullYear() >= 2019), h4 = load("h4", "EU"), d1 = load("d1", "EU");
  CTX = makeCtx(m15, h4, d1); T0 = CTX.t[0]; T1 = CTX.t.at(-1)!;
  console.log(`DATA: JustMarkets broker candles (mt5/tester/XauExport.mq5, EU server clock → UTC). M15 ${dayKey(T0)} → ${dayKey(T1)} (${m15.length} bars), H4 ${h4.length}, D1 ${d1.length}. IS < ${dayKey(CUT)} ≤ OOS. Cost levels: ${COSTS.map((c) => c.label).join(", ")}.`);

  // rollover check: where the daily M15 break sits in UTC (the break straddles the server-midnight rollover)
  {
    const miss = (summer: boolean) => {
      const have = new Set(CTX.t.filter((x) => euSummer(x) === summer && [2, 3, 4].includes(new Date(x).getUTCDay())).map((x) => x % DAY));
      const cnt = new Map<number, number>(); CTX.t.forEach((x) => { if (euSummer(x) === summer && [2, 3, 4].includes(new Date(x).getUTCDay())) cnt.set(x % DAY, (cnt.get(x % DAY) ?? 0) + 1); });
      const mx = Math.max(...cnt.values());
      return Array.from({ length: 96 }, (_, s) => s * M15).filter((s) => !have.has(s) || (cnt.get(s) ?? 0) < 0.5 * mx).map((s) => `${String(Math.floor(s / H)).padStart(2, "0")}:${String((s % H) / 6e4).padStart(2, "0")}`);
    };
    console.log(`ROLLOVER CHECK — 15m slots (UTC, Tue–Thu) mostly missing = the broker's daily break: winter ${miss(false).join(",") || "none"} · summer ${miss(true).join(",") || "none"}. Rollover modelled at server 00:00 = 22:00 UTC winter / 21:00 UTC summer (EU DST).`);
  }

  // ── reference ──
  {
    const A0 = Date.UTC(2018, 11, 31), wk = new Map<number, number>();
    for (const x of CTX.t) { const k = Math.floor((x - A0) / WK); wk.set(k, (wk.get(k) ?? 0) + 1); }
    const covered = (a: number, b: number) => ([...wk].filter(([k, n]) => n >= 300 && A0 + k * WK >= a && A0 + k * WK < b).length * WK) / YR;
    YEARS = [covered(T0, T1 + 1), covered(T0, CUT), covered(CUT, T1 + 1)];
    const holes = CTX.t.flatMap((x, i) => (i && x - CTX.t[i - 1] > HOLE ? [`${dayKey(CTX.t[i - 1])}→${dayKey(x)}`] : []));
    console.log(`COVERAGE — weeks with ≥ 300 M15 bars: all ${YEARS[0].toFixed(2)} y, IS ${YEARS[1].toFixed(2)} y, OOS ${YEARS[2].toFixed(2)} y (CAGR uses these). M15 holes > 4 days: ${holes.length} (largest: ${holes.join(", ")}). Trades whose walk crosses a hole are dropped (outcome unknown).`);
    DROP_HOLES = false;
    const raw = live(0.3), q = split(raw), a = account(raw, 1);
    console.log(`REFERENCE EXACTLY AS IN EARLIER SCRIPTS (trades held across holes kept) @0.30: 19–22 ${cell(q.a)} | 23→ ${cell(q.b)} | $1500@1% ${pc(a.ret)} DD ${a.dd.toFixed(1)}%`);
    DROP_HOLES = true;
  }
  const REF = COSTS.map((c) => live(c.spread));
  console.log("\nREFERENCE — live 3 session breakouts, NY minDailyScore 35. Expected @0.30: 19–22 PF 1.41 +0.166R n216 · 23→ PF 1.57 +0.219R n325 · $1,500@1% +178%, DD 11.1%");
  for (const [ci, c] of COSTS.entries()) {
    const q = split(REF[ci]), a = account(REF[ci], 1);
    console.log(`  spread ${c.spread.toFixed(2)} | 19–22 ${cell(q.a)} | 23→ ${cell(q.b)} | all ${cell(q.all)} | $1500@1% ${pc(a.ret)} DD ${a.dd.toFixed(1)}% · MTM DD ${mtmDD(REF[ci], 1).toFixed(1)}%`);
    for (const r of SESSION_RULES) { const x = split(REF[ci].filter((y) => y.rule === r.id)); console.log(`     ${r.id.padEnd(17)} | 19–22 ${cell(x.a)} | 23→ ${cell(x.b)}`); }
  }
  const BASE: Cfg = { name: "baseline (live 3, ny-late overnight, no swap)", ts: REF };

  // ── engines ──
  type Eng = { key: string; label: string; vars: Var<unknown>[]; rs: (v: Var<unknown>) => Resim };
  const engines: Eng[] = [
    { key: "1", label: "xau-h4-swing", rs: (v) => resimSwing(v.p as SP), vars: grid<SP>(S_DIMS, swing, "1) XAU-H4-SWING — closed 4H close beyond the N-bar high/low, daily score sign agrees and |D1| ≥ minD, stop k×ATR14(4H), exit chandelier m×ATR from the extreme since entry (chM) or close beyond the opposite N/2 channel (don), max 1 position, swap per night (Wed ×3)") as Var<unknown>[] },
    { key: "2A", label: "london-fakeout", rs: () => resim15, vars: grid<FP>(F_DIMS, fakeout, "2A) LONDON FAKEOUT REVERSION — Asian range 00–07 (≥20 bars), 07–12 a 15m bar wicks out and closes back inside → fade if |D1| < maxD, stop wick ± 0.05×dATR, TP 1.5R / 2R / range mid (needs ≥ 1R), flat 20:00, 1/day") as Var<unknown>[] },
    { key: "2B", label: "trend-pullback", rs: () => resim15, vars: grid<PP>(P_DIMS, pullback, "2B) INTRADAY TREND PULLBACK — 07–16, |D1| ≥ 50 & |4H| ≥ 35 same sign, 15m bar touches the EMA and closes back on the trend side, stop at the bar extreme (≥ 0.20×dATR), TP rr, flat 20:00, 1/day") as Var<unknown>[] },
  ];
  const passing: Cfg[] = [], engRows: Cfg[] = [], summary: string[] = [];
  for (const e of engines) {
    const { v, robust, plateau } = pick(e.vars);
    console.log(`\n${e.key}) ${e.label.toUpperCase()} — ${robust ? "best robust cell" : "NO ROBUST CELL; best by worst-column avg R (information only)"}: ${v.name} · robust neighbours ${v.nb}/${v.nbN} → plateau ${plateau ? "PASS" : "FAIL"}`);
    const ps: { a: number; b: number; all: number }[] = [], rc: number[] = [];
    for (const [ci, c] of COSTS.entries()) {
      const ts = v.per[ci].ts, q = split(ts);
      console.log(`    ${c.label}: IS ${cell(q.a)} | OOS ${cell(q.b)} | all ${cell(q.all)}${e.key === "1" ? ` · avg nights held ${(ts.reduce((s, x) => s + (x.nightsN ?? 0), 0) / Math.max(1, ts.length)).toFixed(1)}` : ""}`);
      rc.push(dailyCorr(REF[ci], ts));
      years(REF[ci], ts, e.label);
      console.log("      null test:");
      ps.push(nullTest(ts, c, e.rs(v)));
    }
    if (e.key === "1") { // swap sensitivity of the chosen swing cell
      for (const sw of [0, 0.2, 0.4, 0.6]) { const q = split(swing(v.p as SP, { spread: 0.3, swap: sw, label: "" })); console.log(`    swap $${sw.toFixed(2)} @ spread 0.30: IS ${sR(q.a.avg)} PF ${fx(q.a.pf)} | OOS ${sR(q.b.avg)} PF ${fx(q.b.pf)}`); }
    }
    const nullOk = ps.every((p) => p.all < 0.05 && p.a < 0.2 && p.b < 0.2);
    const cfg: Cfg = { name: `+ ${e.label} [${v.name}]`, ts: COSTS.map((_, ci) => [...REF[ci], ...v.per[ci].ts]) };
    const bt = beats(BASE, cfg);
    const pass = robust && plateau && nullOk && bt.ok;
    console.log(`    VERDICT ${e.label}: robust ${robust ? "yes" : "no"} · plateau ${plateau ? "yes" : "no"} · null (p_all < 0.05 & p_IS, p_OOS < 0.20 at both costs) ${nullOk ? "yes" : "no"} [${ps.map((p) => `${p.a.toFixed(3)}/${p.b.toFixed(3)}/${p.all.toFixed(3)}`).join(" ; ")}] · adds at equal DD IS & OOS ${bt.ok ? "yes" : "no"} → ${pass ? "PASS" : "FAIL"}`);
    console.log(`      ${bt.txt}`);
    summary.push(`${e.label}: ${pass ? "PASS" : "FAIL"} (${v.name}; cells robust ${e.vars.filter((u) => u.robust).length}/${e.vars.length}; corr ${rc.map((x) => fx(x)).join("/")})`);
    engRows.push({ ...cfg, name: `${pass ? "" : "(fail) "}${cfg.name}`.slice(0, 46) });
    if (pass) passing.push(cfg);
  }

  // ── 3) sizing ──
  console.log("\n3) SIZING ON THE CURRENT 3 (no new entries) — CAGR at equal max DD, IS and OOS separately (closed-balance DD; each period run alone from $1,500)");
  const fam: [string, [string, Sz][]][] = [
    ["3A overlap", [0.5, 0.75].flatMap((w2) => [0.25, 0.5].map((w3) => [`w2=${w2} w3=${w3}`, { w2, w3 }] as [string, Sz]))],
    ["3B conviction", [1.25, 1.5].flatMap((hi) => [0.5, 0.75].flatMap((lo) => [false, true].map((use4h) => [`hi=${hi} lo=${lo}${use4h ? " +4H" : ""}`, { conv: { hi, lo, use4h } }] as [string, Sz])))],
    ["3C throttle", [5, 7].map((thr) => [`×0.5 when > ${thr}% below peak`, { thr }] as [string, Sz])],
  ];
  {
    console.log("  conviction buckets (current 3, spread 0.30): strong = |D1| ≥ 65 (and |4H| ≥ 65 for +4H), weak = |D1| < 35 (or |4H| < 35 for +4H); per setup avg R / n IS → OOS");
    for (const u of [false, true]) {
      const lab = (x: Trade) => { const a = Math.abs(x.d1), f = Math.abs(x.h4); return a >= 65 && (!u || f >= 65) ? "strong" : a < 35 || (u && f < 35) ? "weak" : "mid"; };
      for (const b of ["strong", "mid", "weak"]) {
        const q = split(REF[0].filter((x) => lab(x) === b));
        const per = SESSION_RULES.map((r) => { const z = split(REF[0].filter((x) => lab(x) === b && x.rule === r.id)); return `${r.id.slice(0, 7)} ${sR(z.a.avg)}/${z.a.n} → ${sR(z.b.avg)}/${z.b.n}`; }).join(" · ");
        console.log(`    ${(u ? "D1+4H " : "D1    ") + b.padEnd(7)} IS ${sR(q.a.avg)} PF ${fx(q.a.pf)} n${String(q.a.n).padStart(4)} | OOS ${sR(q.b.avg)} PF ${fx(q.b.pf)} n${String(q.b.n).padStart(4)}   [${per}]`);
      }
    }
  }
  const baseE = COSTS.map((_, ci) => evalAcc(REF[ci]));
  const bestSz: Cfg[] = [];
  for (const [fname, cells] of fam) {
    console.log(`\n  ${fname} — CAGR% @DD11.1 / @DD15   [${COSTS.map((c) => `${c.label}: IS | OOS | all`).join("   ")}]`);
    const show = (name: string, e: PerRes[][]) => console.log(`    ${name.padEnd(32)} ${e.map((x) => [1, 2, 0].map((pi) => `${x[pi].eq[0].cagr.toFixed(1).padStart(5)}/${x[pi].eq[1].cagr.toFixed(1).padStart(5)}`).join(" | ")).join("   ")}`);
    show("baseline", baseE);
    let best: { name: string; sz: Sz; score: number; ok: boolean } | null = null, nPass = 0;
    for (const [n, sz] of cells) {
      const e = COSTS.map((_, ci) => evalAcc(REF[ci], sz));
      const ok = e.every((x, ci) => [1, 2].every((pi) => DD_TARGETS.every((_, di) => x[pi].eq[di].cagr > baseE[ci][pi].eq[di].cagr)));
      const score = Math.min(...e.flatMap((x, ci) => [1, 2].map((pi) => x[pi].eq[0].cagr - baseE[ci][pi].eq[0].cagr)));
      if (ok) nPass++;
      show(`${ok ? "** " : "   "}${n}`, e);
      if (!best || score > best.score) best = { name: n, sz, score, ok };
    }
    console.log(`    cells beating baseline in IS & OOS at both DDs & both costs: ${nPass} / ${cells.length} · best: ${best!.name} (worst-period CAGR gain @11.1 ${best!.score.toFixed(2)} pts) → ${best!.ok && nPass >= Math.ceil(cells.length / 2) ? "PASS" : best!.ok ? "passes alone but family < half → overfit risk" : "FAIL"}`);
    const cfg: Cfg = { name: `${best!.ok && nPass >= Math.ceil(cells.length / 2) ? "" : "(fail) "}${fname}: ${best!.name}`.slice(0, 46), ts: REF, sz: best!.sz };
    bestSz.push(cfg);
    summary.push(`${fname}: ${best!.ok && nPass >= Math.ceil(cells.length / 2) ? "PASS" : "FAIL"} (best ${best!.name}; family ${nPass}/${cells.length})`);
    if (best!.ok && nPass >= Math.ceil(cells.length / 2)) passing.push(cfg);
  }
  // Null test for conviction sizing: the same multipliers shuffled across trades (within IS and within OOS), 300 seeds.
  console.log("\n  3B null — conviction multipliers shuffled at random across the trades of each period (300 seeds), CAGR gain @DD 11.1% vs baseline, spread 0.30");
  for (const conv of [{ hi: 1.5, lo: 0.75, use4h: true }, { hi: 1.25, lo: 0.75, use4h: true }, { hi: 1.25, lo: 0.75, use4h: false }]) {
    const mult = (x: Trade) => { const a = Math.abs(x.d1), f = Math.abs(x.h4); return a >= 65 && (!conv.use4h || f >= 65) ? conv.hi : a < 35 || (conv.use4h && f < 35) ? conv.lo : 1; };
    const parts = [1, 2].map((pi) => {
      const q = REF[0].filter(PERIODS[pi][1]), yrs = YEARS[pi];
      const cg = (ts: Trade[]) => { const pct = eqRisk(ts, 11.1), a = account(ts, pct); return 100 * (Math.pow(a.bal / START, 1 / yrs) - 1); };
      const base = cg(q), act = cg(q.map((x) => ({ ...x, wx: mult(x) }))) - base, ms = q.map(mult), rnd = mulberry(4242 + pi), sims: number[] = [];
      for (let s = 0; s < 300; s++) { const p = [...ms]; for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } sims.push(cg(q.map((x, i) => ({ ...x, wx: p[i] }))) - base); }
      const mean = sims.reduce((s, v) => s + v, 0) / sims.length;
      return `${PERIODS[pi][0]}: actual ${act >= 0 ? "+" : ""}${act.toFixed(1)} pts, shuffled mean ${mean >= 0 ? "+" : ""}${mean.toFixed(1)}, p = ${(sims.filter((v) => v >= act).length / sims.length).toFixed(3)}`;
    });
    console.log(`    hi=${conv.hi} lo=${conv.lo}${conv.use4h ? " +4H" : "    "} | ${parts.join(" | ")}`);
  }

  // ── 4) cost stress ──
  console.log("\n4) COST STRESS");
  const late = (ts: Trade[]) => ts.filter((x) => x.rule === "ny-late-breakout");
  const variants: [string, (ci: number) => Trade[]][] = [
    ["ny-late overnight, no cost (current model)", (ci) => REF[ci]],
    ["ny-late overnight + roll $1.50 + swap $0.25", (ci) => overnight(REF[ci], 1.5, 0.25)],
    ["ny-late overnight + roll $2.50 + swap $0.25", (ci) => overnight(REF[ci], 2.5, 0.25)],
    ["ny-late flat 20:00 UTC", (ci) => live(COSTS[ci].spread, { nyLate20: true })],
  ];
  const vts = variants.map(([n, f]) => ({ n, ts: COSTS.map((_, ci) => f(ci)) }));
  for (const [ci, c] of COSTS.entries()) {
    console.log(`  ${c.label}: ny-late trades alone | IS ${CELLH} | OOS ${CELLH}`);
    for (const v of vts) { const q = split(late(v.ts[ci])); console.log(`    ${v.n.padEnd(46)} | ${cell(q.a)} | ${cell(q.b)}`); }
    const held = late(REF[ci]).filter((x) => crossesRoll(x.entryT, x.end));
    console.log(`    ny-late trades still open at the rollover: ${held.length} of ${late(REF[ci]).length} (avg risk $${(held.reduce((s, x) => s + x.risk, 0) / Math.max(1, held.length)).toFixed(2)}/oz → $1.50 ≈ ${(1.5 / (held.reduce((s, x) => s + x.risk, 0) / Math.max(1, held.length))).toFixed(3)}R each)`);
  }
  const REAL15: Cfg = { name: "baseline + real ny-late cost ($1.50 roll+swap)", ts: vts[1].ts };
  const REAL25: Cfg = { name: "baseline + ny-late cost ($2.50 roll+swap)", ts: vts[2].ts };
  const FLAT20: Cfg = { name: "ny-late flat 20:00 UTC", ts: vts[3].ts };
  const flatVs15 = beats(REAL15, FLAT20), flatVs25 = beats(REAL25, FLAT20);
  console.log(`  flat 20:00 vs overnight with $1.50 cost at equal DD: ${flatVs15.ok ? "FLAT WINS IS & OOS" : "no clean win"} — ${flatVs15.txt}`);
  console.log(`  flat 20:00 vs overnight with $2.50 cost at equal DD: ${flatVs25.ok ? "FLAT WINS IS & OOS" : "no clean win"} — ${flatVs25.txt}`);

  console.log("  rollover-spread sweep (swap $0.25, spread 0.30): CAGR @DD 11.1% IS / OOS / all");
  { const f = evalAcc(FLAT20.ts[0]); console.log(`    ${"ny-late flat 20:00".padEnd(34)} ${f[1].eq[0].cagr.toFixed(1)} / ${f[2].eq[0].cagr.toFixed(1)} / ${f[0].eq[0].cagr.toFixed(1)}`); }
  for (const roll of [0, 0.25, 0.5, 0.75, 1.0, 1.5]) { const e = evalAcc(overnight(REF[0], roll, 0.25)); console.log(`    ${`overnight roll $${roll.toFixed(2)} + swap $0.25`.padEnd(34)} ${e[1].eq[0].cagr.toFixed(1)} / ${e[2].eq[0].cagr.toFixed(1)} / ${e[0].eq[0].cagr.toFixed(1)}`); }

  console.log("\n  ENTRY DELAY / FILTER (all 3 setups; entry = next bar open ≈ 1 minute after the close)");
  {
    const g: number[] = []; live(0.3, { gaps: g });
    const a = g.map(Math.abs).sort((x, y) => x - y);
    console.log(`  next M15 open vs breakout close, in R: median |gap| ${a[a.length >> 1].toFixed(3)}R, 99th pct ${a[Math.floor(0.99 * a.length)].toFixed(3)}R, max ${a.at(-1)!.toFixed(3)}R; > 0.25R adverse ${g.filter((x) => x < -0.25).length}, > 0.3R favourable ${g.filter((x) => x > 0.3).length} of ${g.length} signals. M15 data cannot resolve "1 minute later" (the next open is the close ± cents), so these rules cannot bind; proxy: enter one full bar (15 min) late.`);
  }
  const ef: [string, LiveOpts][] = [["current (next open)", {}], ["skip next open > 0.25R adverse", { adverse: 0.25 }], ["0.3R favourable slip rule (robot)", { slip: 0.3 }], ["adverse 0.25R + slip 0.3R", { adverse: 0.25, slip: 0.3 }],
    ["15-min late entry, no rule", { delay: 1 }], ["15-min late + skip > 0.25R adverse", { delay: 1, adverse: 0.25 }], ["15-min late + 0.3R slip rule", { delay: 1, slip: 0.3 }], ["15-min late + adverse 0.25R + slip 0.3R", { delay: 1, adverse: 0.25, slip: 0.3 }]];
  const efts = ef.map(([n, o]) => ({ n, ts: COSTS.map((c) => live(c.spread, o)) }));
  for (const [ci, c] of COSTS.entries()) {
    console.log(`  ${c.label}: portfolio | IS ${CELLH} | OOS ${CELLH}`);
    for (const v of efts) { const q = split(v.ts[ci]); console.log(`    ${v.n.padEnd(46)} | ${cell(q.a)} | ${cell(q.b)}`); }
  }
  const efCfg = efts.slice(1).map((v) => ({ name: v.n, ts: v.ts } as Cfg));
  const LATE = efCfg[3]; // the 15-min-late rows are judged against 15-min-late without a rule
  const efPass = efCfg.filter((g) => g !== LATE).map((g) => ({ g, b: beats(g.name.startsWith("15-min") ? LATE : BASE, g) }));
  for (const { g, b } of efPass) { console.log(`    ${g.name}: ${b.ok ? "PASS" : "FAIL"} at equal DD — ${b.txt}`); summary.push(`entry ${g.name}: ${b.ok ? "PASS" : "FAIL"}`); }
  summary.push(`ny-late flat 20:00 vs overnight+$1.50: ${flatVs15.ok ? "FLAT WINS" : "no clean win"}; vs +$2.50: ${flatVs25.ok ? "FLAT WINS" : "no clean win"}`);

  // ── combined table ──
  // real-cost base for the combination: the ny-late choice that wins under the $1.50 real cost
  const baseReal = flatVs15.ok ? FLAT20 : REAL15;
  const entryPass = efPass.filter((x) => x.b.ok && !x.g.name.startsWith("15-min")).map((x) => x.g);
  let combTs = COSTS.map((c, ci) => {
    const o: LiveOpts = { nyLate20: flatVs15.ok };
    for (const g of entryPass) { if (g.name.includes("adverse")) o.adverse = 0.25; if (g.name.includes("slip")) o.slip = 0.3; }
    let ts = live(c.spread, o);
    if (!flatVs15.ok) ts = overnight(ts, 1.5, 0.25);
    return ts;
  });
  const sz: Sz = {};
  for (const g of passing) {
    if (g.sz) Object.assign(sz, g.sz);
    else combTs = combTs.map((ts, ci) => [...ts, ...g.ts[ci].filter((x) => !CUR.has(x.rule))]);
  }
  const COMB: Cfg = { name: `COMBINATION (${passing.length ? passing.map((g) => g.name.replace(/^\+ /, "").slice(0, 14)).join(", ") : "nothing passed"}${entryPass.length ? ", " + entryPass.map((g) => g.name.slice(0, 12)).join(", ") : ""})`.slice(0, 46), ts: combTs, sz };
  const combVs = beats(baseReal, COMB);
  const C3B: Sz = { conv: { hi: 1.25, lo: 0.75, use4h: true } };
  const extra: Cfg[] = [
    { name: "3B central cell hi=1.25 lo=0.75 +4H", ts: REF, sz: C3B },
    { name: "overnight+$1.50 cost + 3B best", ts: REAL15.ts, sz: bestSz[1].sz },
    { name: "flat 20:00 + 3B central (1.25/0.75 +4H)", ts: FLAT20.ts, sz: C3B },
  ];
  accTable("COMBINED TABLE", [BASE, REAL15, REAL25, FLAT20, ...efCfg, ...engRows, ...bestSz, ...extra, COMB], true);
  for (const g of extra) { const b = beats(g.name.startsWith("overnight") ? REAL15 : g.name.startsWith("flat") ? FLAT20 : BASE, g); console.log(`  ${g.name} vs its own base: ${b.ok ? "BETTER IS & OOS" : "not better in both"} — ${b.txt}`); }
  console.log(`\n  combination vs real-cost baseline (${baseReal.name}): ${combVs.ok ? "BETTER IS & OOS" : "not better in both"} — ${combVs.txt}`);

  console.log("\nSUMMARY");
  for (const s of summary) console.log(`  ${s}`);
}
main();
