/* eslint-disable @typescript-eslint/no-explicit-any -- research grid parameters are loosely typed */
/**
 * Range-regime / diversifier research next to the live system (broker candles, JustMarkets, 2019 → ; 2019–2022
 * in-sample, 2023 → out-of-sample), spreads $0.30 and $0.50. Machinery copied from scripts/exposure-cap-research.ts
 * and scripts/xau-alpha-research.ts: daily / 4h scoreSeries aligned to CLOSED bars, daily ATR, entry at the next bar's
 * open ± spread, stop checked first inside a bar, gaps fill at the open, trades crossing an M15 hole > 4 days dropped,
 * $1,500 account with concurrent positions, closed-balance DD, base risk bisected to an equal max DD.
 * Live = 3 session breakouts (NY |D1| ≥ 35) + conviction sizing (×1.25 / ×0.75) + ×0.5 for a trade taken while a
 * same-direction session position is open.
 * Ideas (each a small grid, plateau check, 500-seed random-side null):
 *   1 pdhl-sweep   previous-day high/low swept by ≥ x·ATR then a 15m close back inside → fade to yesterday's mid, |D1| < 35
 *   2 h1-bb-range  ADX(14,H1) < thr, H1 close outside Bollinger(20,k) then back inside → fade to the middle band
 *   3 ny-fix-fade  |close(M) − open 13:30| ≥ k·ATR at M = 15:00 / 16:00 UTC → fade, target f × move
 *   4 week-gap     Sunday-open gap ≥ g·ATR → trade toward Friday's close
 *   5 late-trend   17–19 UTC, strong daily trend (4h agrees), close at the day's extreme → with trend to 20:00
 *   6 round-num    wick ≥ w of the bar through a $25 / $50 level, closes back, |D1| < 35 → fade, target rr
 *   npx tsx scripts/range-regime-research.ts
 */
import { load } from "./broker-data";
import { alignClosed } from "../src/lib/bot/backtest";
import { atrSeries, type Candle } from "../src/lib/analysis/indicators";
import { scoreSeries } from "../src/lib/bot/strategy";
import { SESSION_RULES, sizeFactor, type SessionRule } from "../src/lib/setup/sessionRules";

const M15 = 15 * 6e4, H = 36e5, DAY = 864e5, WK = 7 * DAY, YR = 365.25 * DAY, CUT = Date.UTC(2023, 0, 1), HOLE = 4 * DAY;
const START = 1500, SPREADS = [0.3, 0.5], SEEDS = 500, MIN_N = 30, MIN_PW = 0.3, DD_TARGETS = [7.5, 11.1], SAME_DIR_MUL = 0.5;

// ───────────────────────────── data ─────────────────────────────
type Ctx = {
  m15: Candle[]; t: number[]; daily: (number | null)[]; four: (number | null)[]; atrD: number[]; pdh: number[]; pdl: number[];
  h1: Candle[]; h1t: number[]; adx: number[]; sma: number[]; sd: number[]; h1daily: (number | null)[]; h1atrD: number[];
};
let CTX: Ctx, T0 = 0, T1 = 0;
const sgn = (x: number | null) => (x === null ? 0 : Math.sign(x));
const hourOf = (ms: number) => (ms % DAY) / H;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const monthKey = (ms: number) => new Date(ms).toISOString().slice(0, 7);
const d0Of = (ms: number) => Math.floor(ms / DAY) * DAY;
function idx15(ms: number) { let lo = 0, hi = CTX.t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (CTX.t[m] < ms) lo = m + 1; else hi = m; } return lo; }

function adxSeries(c: Candle[], n = 14) {
  const out = new Array<number>(c.length).fill(NaN);
  let tr = 0, pdm = 0, mdm = 0, adx = 0;
  const dxs: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const up = c[i].high - c[i - 1].high, dn = c[i - 1].low - c[i].low;
    const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
    const x = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    if (i <= n) { tr += x; pdm += p; mdm += m; if (i < n) continue; }
    else { tr = tr - tr / n + x; pdm = pdm - pdm / n + p; mdm = mdm - mdm / n + m; }
    const pdi = (100 * pdm) / tr, mdi = (100 * mdm) / tr, dx = pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
    if (dxs.length < n) { dxs.push(dx); if (dxs.length === n) { adx = dxs.reduce((s, v) => s + v, 0) / n; out[i] = adx; } }
    else { adx = (adx * (n - 1) + dx) / n; out[i] = adx; }
  }
  return out;
}

type Trade = { r: number; at: number; entryT: number; end: number; rule: string; side: number; entry: number; risk: number; j0: number; tgtR: number; exitAt: number; d1: number; h4: number; live: boolean };

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
/** Common trade builder: entry at m15[j0].open ± spread, stop / target, time exit. */
function mk(rule: string, at: number, j0: number, side: number, stop: number, tgt: number | null, tgtRFix: number | null, exitAt: number, spread: number, minTgtR = 0, d1 = 0, h4 = 0): Trade | null | "skip" {
  const { m15, t } = CTX;
  if (j0 >= m15.length || t[j0] >= exitAt) return "skip";
  const entry = m15[j0].open + side * spread, risk = side * (entry - stop);
  if (!(risk > 0.2)) return "skip";
  const tgtR = tgtRFix ?? (side * ((tgt as number) - entry)) / risk;
  if (!(tgtR >= minTgtR) || !(tgtR > 0)) return "skip";
  const res = walk(j0, side, entry, stop, entry + side * tgtR * risk, risk, exitAt);
  if (!res) return null;
  return { r: res.r, at, entryT: t[j0], end: res.end, rule, side, entry, risk, j0, tgtR, exitAt, d1, h4, live: false };
}

// ───────────────────────────── live ─────────────────────────────
function liveTrades(rule: SessionRule, spread: number): Trade[] {
  const { m15, t } = CTX, out: Trade[] = [];
  let day = "", hi = -Infinity, lo = Infinity, n = 0, done = false;
  for (let i = 0; i < m15.length - 1; i++) {
    const b = m15[i], k = dayKey(t[i]);
    if (k !== day) { day = k; hi = -Infinity; lo = Infinity; n = 0; done = false; }
    const h = hourOf(t[i]);
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
    const nx = m15[i + 1];
    if (side * (nx.open - mid) <= 0) continue;
    const d0 = Date.parse(`${k}T00:00:00Z`), fri = new Date(d0).getUTCDay() === 5;
    const exitAt = rule.exit === "same20" || fri ? d0 + 20 * H : d0 + 31 * H;
    const entry = nx.open + side * spread, risk = side * (entry - mid);
    if (!(risk > 0.2)) continue;
    const res = walk(i + 1, side, entry, mid, entry + side * rule.rr * risk, risk, exitAt);
    if (res) out.push({ r: res.r, at: t[i], entryT: t[i + 1], end: res.end, rule: rule.id, side, entry, risk, j0: i + 1, tgtR: rule.rr, exitAt, d1: d!, h4: f!, live: true });
  }
  return out;
}
const live = (spread: number) => SESSION_RULES.flatMap((r) => liveTrades(r, spread)).sort((a, b) => a.entryT - b.entryT || a.at - b.at);

// ───────────────────────────── 1) previous-day high/low sweep reversal ─────────────────────────────
type P1 = { x: number; win: string; buf: number; minT: number; maxD?: number };
const D1_ = { x: [0.05, 0.15, 0.3], win: ["LDN", "NY", "LDN+NY"], buf: [0.05, 0.15], minT: [1, 1.5] };
function sweep(p: P1, spread: number): Trade[] {
  const { m15, t } = CTX, out: Trade[] = [];
  let day = -1, dHi = -Infinity, dLo = Infinity, done = false, busy = 0;
  for (let i = 1; i < m15.length - 1; i++) {
    const b = m15[i], d0 = d0Of(t[i]);
    if (d0 !== day) { day = d0; dHi = -Infinity; dLo = Infinity; done = false; }
    dHi = Math.max(dHi, b.high); dLo = Math.min(dLo, b.low);
    const h = hourOf(t[i]);
    const inWin = (p.win.includes("LDN") && h >= 7 && h < 12) || (p.win.includes("NY") && h >= 12.5 && h < 17);
    if (!inWin || done || t[i] < busy) continue;
    const PH = CTX.pdh[i], PL = CTX.pdl[i], atr = CTX.atrD[i], d = CTX.daily[i];
    if (!Number.isFinite(PH) || !Number.isFinite(atr) || d === null || Math.abs(d) >= (p.maxD ?? 35)) continue;
    const prev = m15[i - 1], sameDay = d0Of(t[i - 1]) === d0;
    const up = dHi >= PH + p.x * atr && b.close < PH && ((sameDay && prev.close >= PH) || b.high >= PH + p.x * atr);
    const dn = dLo <= PL - p.x * atr && b.close > PL && ((sameDay && prev.close <= PL) || b.low <= PL - p.x * atr);
    if (up === dn) continue;
    const side = up ? -1 : 1, stop = up ? dHi + p.buf * atr : dLo - p.buf * atr;
    const tr = mk("pdhl-sweep", t[i], i + 1, side, stop, (PH + PL) / 2, null, d0 + 20 * H, spread, p.minT, d, CTX.four[i] ?? 0);
    if (tr === "skip") continue;
    done = true;
    if (tr) { out.push(tr); busy = tr.end; }
  }
  return out;
}

// ───────────────────────────── 2) H1 Bollinger range reversion ─────────────────────────────
type P2 = { k: number; adx: number; minT: number; win: string };
const D2_ = { k: [2.0, 2.25, 2.5], adx: [15, 20, 25], minT: [0.5, 1.0], win: ["01-19", "07-19"] };
function bbRange(p: P2, spread: number): Trade[] {
  const { h1, h1t, adx, sma, sd, t } = CTX, out: Trade[] = [];
  let busy = 0;
  const h0 = p.win === "01-19" ? 1 : 7;
  for (let j = 21; j < h1.length; j++) {
    const closeT = h1t[j] + H, h = hourOf(closeT);
    if (h < h0 || h > 19 || closeT < busy || !(adx[j] < p.adx)) continue;
    const upP = sma[j - 1] + p.k * sd[j - 1], loP = sma[j - 1] - p.k * sd[j - 1], up = sma[j] + p.k * sd[j], lo = sma[j] - p.k * sd[j];
    const c1 = h1[j - 1].close, c = h1[j].close;
    const short = c1 > upP && c < up && c > sma[j], long = c1 < loP && c > lo && c < sma[j];
    if (short === long) continue;
    const side = short ? -1 : 1, atr = CTX.h1atrD[j];
    if (!Number.isFinite(atr)) continue;
    const stop = short ? Math.max(h1[j - 1].high, h1[j].high) + 0.05 * atr : Math.min(h1[j - 1].low, h1[j].low) - 0.05 * atr;
    const e = idx15(closeT);
    if (e >= t.length || t[e] >= closeT + H) continue;
    const tr = mk("h1-bb-range", closeT - M15, e, side, stop, sma[j], null, d0Of(closeT) + 20 * H, spread, p.minT, CTX.h1daily[j] ?? 0);
    if (tr && tr !== "skip") { out.push(tr); busy = tr.end; }
  }
  return out;
}

// ───────────────────────────── 3) NY fix fade ─────────────────────────────
type P3 = { k: number; f: number; at: number };
const D3_ = { k: [0.5, 0.75, 1.0], f: [0.5, 0.75, 1.0], at: [15, 16] };
function nyFix(p: P3, spread: number): Trade[] {
  const { m15, t } = CTX, out: Trade[] = [];
  let day = -1, op = NaN, hi = -Infinity, lo = Infinity, done = false;
  for (let i = 0; i < m15.length - 1; i++) {
    const b = m15[i], d0 = d0Of(t[i]), h = hourOf(t[i]);
    if (d0 !== day) { day = d0; op = NaN; hi = -Infinity; lo = Infinity; done = false; }
    if (h === 13.5) op = b.open;
    if (h >= 13.5 && h < p.at) { hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); }
    if (done || h !== p.at - 0.25 || !Number.isFinite(op)) continue;
    done = true;
    const atr = CTX.atrD[i], mv = b.close - op;
    if (!Number.isFinite(atr) || Math.abs(mv) < p.k * atr || t[i + 1] !== t[i] + M15) continue;
    const side = -Math.sign(mv), stop = side < 0 ? hi + 0.1 * atr : lo - 0.1 * atr;
    if (side * (m15[i + 1].open - stop) < 0.1 * atr) continue;
    const tgt = m15[i + 1].open + side * (spread + p.f * Math.abs(mv));
    const tr = mk("ny-fix-fade", t[i], i + 1, side, stop, tgt, null, d0 + 20 * H, spread, 0, CTX.daily[i] ?? 0, CTX.four[i] ?? 0);
    if (tr && tr !== "skip") out.push(tr);
  }
  return out;
}

// ───────────────────────────── 4) weekly open gap fill ─────────────────────────────
type P4 = { g: number; s: number; delay: number };
const D4_ = { g: [0.1, 0.2, 0.3], s: [0.75, 1, 1.5], delay: [0, 4] };
function weekGap(p: P4, spread: number): Trade[] {
  const { m15, t } = CTX, out: Trade[] = [];
  for (let i = 1; i < m15.length - 8; i++) {
    const gapT = t[i] - t[i - 1];
    if (gapT < 36 * H || gapT > HOLE) continue;
    const fri = m15[i - 1].close, gap = m15[i].open - fri, atr = CTX.atrD[i];
    if (!Number.isFinite(atr) || Math.abs(gap) < p.g * atr) continue;
    const side = -Math.sign(gap), e = i + p.delay;
    let filled = false;
    for (let q = i; q < e; q++) if (side > 0 ? m15[q].high >= fri : m15[q].low <= fri) filled = true;
    if (filled) continue;
    let d0 = d0Of(t[i]); if (new Date(d0).getUTCDay() === 0) d0 += DAY;
    const entry = m15[e].open + side * spread, risk = p.s * Math.abs(gap);
    const tr = mk("week-gap", t[i], e, side, entry - side * risk, fri, null, d0 + 20 * H, spread, 0.2);
    if (tr && tr !== "skip") out.push(tr);
  }
  return out;
}

// ───────────────────────────── 5) late-NY trend-day continuation ─────────────────────────────
type P5 = { thr: number; near: number; s: number; tp: number | string };
const D5_ = { thr: [35, 50, 65], near: [0.05, 0.15], s: [0.2, 0.35], tp: [1.5, "time"] };
function lateTrend(p: P5, spread: number): Trade[] {
  const { m15, t } = CTX, out: Trade[] = [];
  let day = -1, op = NaN, hi = -Infinity, lo = Infinity, done = false;
  for (let i = 0; i < m15.length - 1; i++) {
    const b = m15[i], d0 = d0Of(t[i]), h = hourOf(t[i]);
    if (d0 !== day) { day = d0; op = b.open; hi = -Infinity; lo = Infinity; done = false; }
    hi = Math.max(hi, b.high); lo = Math.min(lo, b.low);
    if (done || h < 17 || h >= 19) continue;
    const d = CTX.daily[i], f = CTX.four[i], atr = CTX.atrD[i];
    if (d === null || f === null || !Number.isFinite(atr) || Math.abs(d) < p.thr || sgn(f) !== sgn(d)) continue;
    const side = Math.sign(d);
    if (side > 0 ? b.close < hi - p.near * atr : b.close > lo + p.near * atr) continue;
    if (side * (b.close - op) < 0.5 * atr) continue;
    const entry = m15[i + 1].open + side * spread;
    const tr = mk("late-trend", t[i], i + 1, side, entry - side * p.s * atr, null, p.tp === "time" ? Infinity : Number(p.tp), d0 + 20 * H, spread, 0, d, f);
    if (tr === "skip") continue;
    done = true;
    if (tr) out.push(tr);
  }
  return out;
}

// ───────────────────────────── 6) round-number rejection ─────────────────────────────
type P6 = { S: number; w: number; rr: number; tf: string };
const D6_ = { S: [25, 50], w: [0.6, 0.7], rr: [1, 1.5, 2], tf: ["M15", "H1"] };
function roundNum(p: P6, spread: number): Trade[] {
  const out: Trade[] = [];
  const h1 = p.tf === "H1", bars = h1 ? CTX.h1 : CTX.m15, bt = h1 ? CTX.h1t : CTX.t, step = h1 ? H : M15;
  let busy = 0;
  for (let j = 0; j < bars.length; j++) {
    const closeT = bt[j] + step, h = hourOf(closeT);
    if (h < 7 || h > 19 || closeT < busy) continue;
    const i = h1 ? idx15(closeT) - 1 : j; // m15 index of the last bar inside (for D1 score / ATR at that close)
    if (i < 0 || i >= CTX.t.length - 1) continue;
    const d = CTX.daily[i], atr = CTX.atrD[i];
    if (d === null || Math.abs(d) >= 35 || !Number.isFinite(atr)) continue;
    const c = bars[j], rng = c.high - c.low, top = Math.max(c.open, c.close), bot = Math.min(c.open, c.close);
    if (!(rng >= 0.1 * atr)) continue;
    const Lu = Math.floor(top / p.S) * p.S + p.S, Ld = Math.ceil(bot / p.S) * p.S - p.S;
    const up = c.high >= Lu && c.high - top >= p.w * rng, dn = c.low <= Ld && bot - c.low >= p.w * rng;
    if (up === dn) continue;
    const side = up ? -1 : 1, stop = up ? c.high + 0.03 * atr : c.low - 0.03 * atr;
    const e = idx15(closeT);
    if (e >= CTX.t.length || CTX.t[e] >= closeT + H) continue;
    const tr = mk("round-num", closeT - M15, e, side, stop, null, p.rr, d0Of(closeT) + 20 * H, spread, 0, d);
    if (tr && tr !== "skip") { out.push(tr); busy = tr.end; }
  }
  return out;
}

// ───────────────────────────── metrics ─────────────────────────────
let WEEKS = { a: 1, b: 1, all: 1 }, YEARS = [1, 1, 1];
type St = { n: number; pw: number; win: number; avg: number; pf: number; dd: number; sum: number };
function stats(ts: Trade[], weeks: number): St {
  let w = 0, g = 0, l = 0, s = 0, pk = 0, dd = 0;
  for (const x of [...ts].sort((a, b) => a.end - b.end)) { if (x.r > 0) { w++; g += x.r; } else l -= x.r; s += x.r; pk = Math.max(pk, s); dd = Math.max(dd, pk - s); }
  return { n: ts.length, pw: ts.length / weeks, win: ts.length ? (100 * w) / ts.length : 0, avg: ts.length ? s / ts.length : 0, pf: l > 0 ? g / l : Infinity, dd, sum: s };
}
const split = (ts: Trade[]) => ({ a: stats(ts.filter((x) => x.at < CUT), WEEKS.a), b: stats(ts.filter((x) => x.at >= CUT), WEEKS.b), all: stats(ts, WEEKS.all) });
const fx = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "inf");
const sR = (x: number) => (Number.isFinite(x) ? (x >= 0 ? "+" : "") + x.toFixed(3) : "   -  ");
const pc = (x: number, d = 1) => (x >= 0 ? "+" : "") + x.toFixed(d) + "%";
const good = (s: St) => s.avg > 0 && s.pf > 1.1 && s.n >= MIN_N && s.pw >= MIN_PW;
const cell = (s: St) => `${String(s.n).padStart(4)} ${fx(s.pw).padStart(4)} ${s.win.toFixed(0).padStart(3)}% ${sR(s.avg)} ${fx(s.pf).padStart(5)} ${s.dd.toFixed(1).padStart(5)}`;
const CELLH = "   n  /wk win%   avgR    PF  DD R";
function corr(a: number[], b: number[]) {
  const n = a.length; if (n < 3) return NaN;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let c = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return c / Math.sqrt(va * vb);
}
function mulberry(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

// ───────────────────────────── grid / plateau / null ─────────────────────────────
type Var = { p: Record<string, number | string>; idx: number[]; name: string; per: (ReturnType<typeof split> & { ts: Trade[] })[]; robust: boolean; minAvg: number; nb: number; nbN: number };
function grid(dims: Record<string, readonly (string | number)[]>, fn: (p: any, sp: number) => Trade[], label: string): Var[] {
  const keys = Object.keys(dims);
  let combos: number[][] = [[]];
  for (const k of keys) combos = combos.flatMap((c) => dims[k].map((_, j) => [...c, j]));
  const vars: Var[] = combos.map((idx) => {
    const p = Object.fromEntries(keys.map((k, d) => [k, dims[k][idx[d]]]));
    const per = SPREADS.map((sp) => { const ts = fn(p, sp); return { ...split(ts), ts }; });
    const robust = per.every((q) => good(q.a) && good(q.b));
    return { p, idx, name: keys.map((k, d) => `${k}=${dims[k][idx[d]]}`).join(" "), per, robust, minAvg: Math.min(...per.flatMap((q) => [q.a.avg, q.b.avg])), nb: 0, nbN: 0 };
  });
  for (const v of vars) {
    const nbs = vars.filter((u) => u !== v && u.idx.filter((x, d) => x !== v.idx[d]).length === 1 && u.idx.every((x, d) => Math.abs(x - v.idx[d]) <= 1));
    v.nb = nbs.filter((u) => u.robust).length; v.nbN = nbs.length;
  }
  console.log(`\n${label}\n  ${vars.length} cells · ** = avg R > 0, PF > 1.1, n ≥ ${MIN_N} and ≥ ${MIN_PW}/wk in BOTH periods at BOTH spreads · nb = passing neighbours / neighbours`);
  console.log(`  ${"cell".padEnd(38)} | ${SPREADS.flatMap((s) => [`sp${s.toFixed(2)} · 2019–22`, `sp${s.toFixed(2)} · 2023→`]).map((x) => x.padEnd(CELLH.length)).join(" | ")} | nb`);
  console.log(`  ${"".padEnd(38)} | ${[CELLH, CELLH, CELLH, CELLH].join(" | ")} |`);
  for (const v of vars) console.log(`  ${((v.robust ? "** " : "   ") + v.name).padEnd(38)} | ${v.per.flatMap((q) => [cell(q.a), cell(q.b)]).join(" | ")} | ${v.nb}/${v.nbN}`);
  const nRob = vars.filter((v) => v.robust).length, pos = vars.filter((v) => v.per.every((q) => q.a.avg > 0 && q.b.avg > 0)).length;
  console.log(`  cells passing: ${nRob} / ${vars.length} · avg R > 0 in all four columns (ignoring PF / n / freq): ${pos} / ${vars.length} · IS→OOS corr of avg R across cells (sp0.30) ${fx(corr(vars.map((v) => v.per[0].a.avg), vars.map((v) => v.per[0].b.avg)))}`);
  return vars;
}
function pick(vars: Var[]) {
  const rob = vars.filter((v) => v.robust);
  const pool = rob.length ? rob : vars.filter((v) => v.per.every((q) => q.a.n >= 10 && q.b.n >= 10));
  const v = [...(pool.length ? pool : vars)].sort((x, y) => y.nb - x.nb || y.minAvg - x.minAvg)[0];
  return { v, robust: v.robust, plateau: v.robust && v.nbN > 0 && v.nb >= Math.ceil(v.nbN / 2) };
}
const resim = (x: Trade, side: number, spread: number): Trade | null => {
  const entry = CTX.m15[x.j0].open + side * spread, res = walk(x.j0, side, entry, entry - side * x.risk, entry + side * x.tgtR * x.risk, x.risk, x.exitAt);
  return res ? { ...x, side, entry, r: res.r, end: res.end } : null;
};
function nullTest(ts: Trade[], spread: number) {
  const act = split(ts), av = { a: [] as number[], b: [] as number[], all: [] as number[] };
  for (let s = 1; s <= SEEDS; s++) {
    const rnd = mulberry(s * 7919);
    const q = split(ts.map((x) => resim(x, rnd() < 0.5 ? 1 : -1, spread)).filter((x): x is Trade => !!x));
    for (const k of ["a", "b", "all"] as const) av[k].push(q[k].avg);
  }
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length, p = (k: "a" | "b" | "all") => av[k].filter((y) => y >= act[k].avg).length / SEEDS;
  for (const k of ["a", "b", "all"] as const) console.log(`      ${(k === "a" ? "19–22" : k === "b" ? "23→" : "all").padEnd(5)} actual avg ${sR(act[k].avg)} PF ${fx(act[k].pf)} | random side mean ${sR(mean(av[k]))} · p = ${p(k).toFixed(3)}`);
  return { a: p("a"), b: p("b"), all: p("all") };
}
function dailyR(ts: Trade[], w: (x: Trade) => number = () => 1) { const m = new Map<string, number>(); for (const x of ts) m.set(dayKey(x.end), (m.get(dayKey(x.end)) ?? 0) + x.r * w(x)); return m; }
function dailyCorr(ref: Trade[], add: Trade[], from = T0, to = T1) {
  const A = dailyR(ref, (x) => sizeFactor(x.d1, x.h4)), B = dailyR(add), days: string[] = [];
  for (let d = d0Of(from); d <= to; d += DAY) { const wd = new Date(d).getUTCDay(); if (wd >= 1 && wd <= 5) days.push(dayKey(d)); }
  const both = days.filter((k) => A.has(k) && B.has(k));
  return { all: corr(days.map((k) => A.get(k) ?? 0), days.map((k) => B.get(k) ?? 0)), shared: corr(both.map((k) => A.get(k)!), both.map((k) => B.get(k)!)), nShared: both.length };
}
function yearRow(label: string, ts: Trade[]) {
  const ys = Array.from({ length: 8 }, (_, i) => 2019 + i);
  return `      ${label.padEnd(14)} ${ys.map((y) => { const q = ts.filter((x) => new Date(x.at).getUTCFullYear() === y); const s = q.reduce((a, x) => a + x.r, 0); return `${(s >= 0 ? "+" : "") + s.toFixed(1)}/${q.length}`.padStart(11); }).join(" ")}`;
}

// ───────────────────────────── account ─────────────────────────────
/** Live trades: conviction × (0.5 while a same-direction live position is open). New trades: wNew × base risk. cap = max open positions (0 = none). */
type Acc = { wNew: number; cap: number; conv: boolean; sameHalf: boolean };
const LIVE_ACC: Acc = { wNew: 1, cap: 0, conv: true, sameHalf: true };
function account(ts: Trade[], pct: number, a: Acc) {
  let bal = START, pk = START, dd = 0, skips = 0;
  const open: { end: number; usd: number; r: number; side: number; live: boolean }[] = [], events: [number, number][] = [];
  const closeUntil = (tm: number) => {
    open.sort((x, y) => x.end - y.end);
    while (open.length && open[0].end <= tm) { const q = open.shift()!; bal += q.usd * q.r; pk = Math.max(pk, bal); dd = Math.max(dd, (100 * (pk - bal)) / pk); events.push([q.end, bal]); }
  };
  for (const x of ts) {
    closeUntil(x.entryT);
    if (a.cap && open.length >= a.cap) { skips++; continue; }
    const w = x.live ? (a.conv ? sizeFactor(x.d1, x.h4) : 1) * (a.sameHalf && open.some((o) => o.live && o.side === x.side) ? SAME_DIR_MUL : 1) : a.wNew;
    if (w > 0) open.push({ end: x.end, usd: (pct / 100) * bal * w, r: x.r, side: x.side, live: x.live });
  }
  closeUntil(Infinity);
  return { ret: (100 * (bal - START)) / START, dd, bal, events, skips };
}
function eqRisk(ts: Trade[], target: number, a: Acc) {
  let lo = 0.01, hi = 25;
  if (account(ts, hi, a).dd < target) return hi;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (account(ts, m, a).dd < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
let MONTHS: string[] = [];
function profMonths(events: [number, number][], from: number, to: number) {
  const ms = MONTHS.filter((m) => Date.parse(`${m}-01T00:00:00Z`) >= d0Of(from) - 31 * DAY && Date.parse(`${m}-01T00:00:00Z`) < to);
  let k = 0, bal = START, prev = START, pos = 0, n = 0;
  for (const m of ms) {
    while (k < events.length && monthKey(events[k][0]) <= m) bal = events[k++][1];
    if (Date.parse(`${m}-01T00:00:00Z`) >= d0Of(from) - 1) { n++; if (bal > prev + 1e-9) pos++; }
    prev = bal;
  }
  return { pos, n, share: n ? (100 * pos) / n : 0 };
}
const PERIODS: [string, (x: Trade) => boolean, () => [number, number]][] = [["all", () => true, () => [T0, T1 + 1]], ["IS 19–22", (x) => x.at < CUT, () => [T0, CUT]], ["OOS 23→", (x) => x.at >= CUT, () => [CUT, T1 + 1]]];
function evalAcc(ts: Trade[], a: Acc) {
  return PERIODS.map(([, f, rng], pi) => {
    const q = ts.filter(f), r1 = account(q, 1, a), [fr, to] = rng();
    const eq = DD_TARGETS.map((d) => { const pct = eqRisk(q, d, a), z = account(q, pct, a); return { pct, ret: z.ret, dd: z.dd, cagr: 100 * (Math.pow(z.bal / START, 1 / YEARS[pi]) - 1), months: profMonths(z.events, fr, to) }; });
    return { n: q.length, r1, eq };
  });
}

// ───────────────────────────── main ─────────────────────────────
function main() {
  const m15 = load("m15", "EU").filter((b) => b.time.getUTCFullYear() >= 2019), h4 = load("h4", "EU"), d1 = load("d1", "EU");
  const t = m15.map((c) => c.time.getTime()), dec = t.map((x) => x + M15);
  // previous UTC trading day's high / low (a day with ≥ 40 M15 bars)
  const days = new Map<number, { hi: number; lo: number; n: number }>();
  m15.forEach((c, i) => { const d = d0Of(t[i]), z = days.get(d) ?? { hi: -Infinity, lo: Infinity, n: 0 }; z.hi = Math.max(z.hi, c.high); z.lo = Math.min(z.lo, c.low); z.n++; days.set(d, z); });
  const full = [...days].filter(([, z]) => z.n >= 40).sort((a, b) => a[0] - b[0]);
  const pdh: number[] = [], pdl: number[] = [];
  { let k = -1; for (let i = 0; i < t.length; i++) { const d = d0Of(t[i]); while (k + 1 < full.length && full[k + 1][0] < d) k++; pdh.push(k >= 0 ? full[k][1].hi : NaN); pdl.push(k >= 0 ? full[k][1].lo : NaN); } }
  // H1 bars built from M15
  const h1: Candle[] = [], h1t: number[] = [];
  m15.forEach((c, i) => { const hs = Math.floor(t[i] / H) * H; if (h1t.at(-1) !== hs) { h1t.push(hs); h1.push({ time: new Date(hs), open: c.open, high: c.high, low: c.low, close: c.close }); } else { const z = h1.at(-1)!; z.high = Math.max(z.high, c.high); z.low = Math.min(z.low, c.low); z.close = c.close; } });
  const cl = h1.map((c) => c.close), sma: number[] = [], sd: number[] = [];
  for (let j = 0; j < h1.length; j++) { if (j < 19) { sma.push(NaN); sd.push(NaN); continue; } const w = cl.slice(j - 19, j + 1), m = w.reduce((s, v) => s + v, 0) / 20; sma.push(m); sd.push(Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / 20)); }
  const h1dec = h1t.map((x) => x + H), sdD = scoreSeries(d1), atrD1 = atrSeries(d1);
  CTX = {
    m15, t, daily: alignClosed(dec, d1, sdD, "1day"), four: alignClosed(dec, h4, scoreSeries(h4), "4h"), atrD: alignClosed(dec, d1, atrD1, "1day").map((x) => x ?? NaN), pdh, pdl,
    h1, h1t, adx: adxSeries(h1), sma, sd, h1daily: alignClosed(h1dec, d1, sdD, "1day"), h1atrD: alignClosed(h1dec, d1, atrD1, "1day").map((x) => x ?? NaN),
  };
  T0 = t[0]; T1 = t.at(-1)!;
  const A0 = Date.UTC(2018, 11, 31), wk = new Map<number, number>();
  for (const x of t) { const k = Math.floor((x - A0) / WK); wk.set(k, (wk.get(k) ?? 0) + 1); }
  const coveredW = (a: number, b: number) => [...wk].filter(([k, n]) => n >= 300 && A0 + k * WK >= a && A0 + k * WK < b).length;
  WEEKS = { a: coveredW(T0, CUT), b: coveredW(CUT, T1 + 1), all: coveredW(T0, T1 + 1) };
  YEARS = [WEEKS.all, WEEKS.a, WEEKS.b].map((w) => (w * WK) / YR);
  for (let d = new Date(Date.UTC(new Date(T0).getUTCFullYear(), new Date(T0).getUTCMonth(), 1)); d.getTime() <= T1; d.setUTCMonth(d.getUTCMonth() + 1)) MONTHS.push(monthKey(d.getTime()));
  // months with real coverage only (≥ 1,200 M15 bars) count for the profitable-month share
  { const mc = new Map<string, number>(); t.forEach((x) => mc.set(monthKey(x), (mc.get(monthKey(x)) ?? 0) + 1)); MONTHS = MONTHS.filter((m) => (mc.get(m) ?? 0) >= 1200); }
  console.log(`DATA: JustMarkets M15 ${dayKey(T0)} → ${dayKey(T1)} (${m15.length} bars), H1 (built from M15) ${h1.length}, H4 ${h4.length}, D1 ${d1.length}. Covered weeks IS ${WEEKS.a} / OOS ${WEEKS.b} (years ${YEARS[1].toFixed(2)} / ${YEARS[2].toFixed(2)}). Months with coverage: ${MONTHS.length}.`);

  // ── reproduction ──
  const LIVE = SPREADS.map(live);
  console.log("\nREPRODUCTION — live 3 breakouts + conviction + ×0.5 same-direction (target: $1,500 @1% all years ≈ +171%, DD ≈ 7.5%)");
  for (const [si, sp] of SPREADS.entries()) {
    const q = split(LIVE[si]);
    const vs: [string, Acc][] = [["flat 1x, no same-dir rule", { ...LIVE_ACC, conv: false, sameHalf: false }], ["conviction only", { ...LIVE_ACC, sameHalf: false }], ["conviction + same-dir ×0.5 (LIVE)", LIVE_ACC], ["LIVE + 3-position cap", { ...LIVE_ACC, cap: 3 }]];
    console.log(`  sp ${sp.toFixed(2)} trades IS ${cell(q.a)} | OOS ${cell(q.b)}`);
    for (const [n, a] of vs) { const z = account(LIVE[si], 1, a); console.log(`    ${n.padEnd(36)} @1% ${pc(z.ret)} DD ${z.dd.toFixed(2)}%`); }
  }
  console.log(yearRow("live R/yr (sp0.30)", LIVE[0]).replace("      ", "  "));

  if (process.env.EXT) { ext(LIVE); return; }
  // ── ideas ──
  type Idea = { key: string; label: string; dims: Record<string, readonly (string | number)[]>; fn: (p: any, sp: number) => Trade[]; desc: string };
  const IDEAS: Idea[] = [
    { key: "1", label: "pdhl-sweep", dims: D1_, fn: sweep, desc: "1) PREVIOUS-DAY HIGH/LOW SWEEP REVERSAL — today (UTC) trades ≥ x·dATR beyond yesterday's high/low, then a 15m close back inside within the window (LDN 07–12 / NY 12:30–17) → fade, stop today's extreme ± buf·dATR, target yesterday's midpoint (≥ minT R), |D1| < 35, flat 20:00, 1/day" },
    { key: "2", label: "h1-bb-range", dims: D2_, fn: bbRange, desc: "2) H1 BOLLINGER RANGE REVERSION — ADX(14,H1) < adx, previous H1 close outside BB(20,k), this one back inside (not past the middle) → fade at the next open, stop beyond the 2-bar extreme + 0.05·dATR, target the middle band (≥ minT R), entries closing in win hours UTC, flat 20:00, no overlap" },
    { key: "3", label: "ny-fix-fade", dims: D3_, fn: nyFix, desc: "3) NY FIX FADE — move = close at `at`:00 UTC − open 13:30; |move| ≥ k·dATR → fade at the next open, stop beyond the 13:30→at extreme + 0.1·dATR (≥ 0.1·dATR away), target f·|move|, flat 20:00" },
    { key: "4", label: "week-gap", dims: D4_, fn: weekGap, desc: "4) WEEKLY OPEN GAP FILL — gap = first bar's open after the weekend − Friday's last close; |gap| ≥ g·dATR → toward Friday's close (target), entry at the open of bar `delay` (skip if already filled), stop s·|gap|, flat Monday 20:00 (spread at the Sunday open is modelled as the normal spread: optimistic)" },
    { key: "5", label: "late-trend", dims: D5_, fn: lateTrend, desc: "5) LATE-NY TREND-DAY CONTINUATION — 17:00–19:00 UTC, |D1| ≥ thr and 4H same sign, close within near·dATR of the day's (UTC) extreme in the trend direction and ≥ 0.5·dATR from the day's open → with trend, stop s·dATR, target tp R or time, flat 20:00, 1/day" },
    { key: "6", label: "round-num", dims: D6_, fn: roundNum, desc: "6) ROUND-NUMBER REJECTION — bar (tf) pierces a multiple of $S and closes back, wick ≥ w of the range (range ≥ 0.1·dATR), |D1| < 35, closes 07–19 UTC → fade, stop wick + 0.03·dATR, target rr R, flat 20:00, no overlap" },
  ];
  const summary: string[] = [];
  const adopt: { label: string; v: Var }[] = [], bests: { label: string; v: Var }[] = [];
  for (const idea of IDEAS) {
    const vars = grid(idea.dims, idea.fn, idea.desc);
    const { v, robust, plateau } = pick(vars);
    const nPass = vars.filter((u) => u.robust).length;
    console.log(`\n  ${idea.key}) ${idea.label.toUpperCase()} — ${robust ? "best passing cell (most passing neighbours)" : "NO PASSING CELL; best by worst-column avg R (information only)"}: ${v.name} · neighbours ${v.nb}/${v.nbN} → plateau ${plateau ? "yes" : "no"}`);
    const ps: { a: number; b: number; all: number }[] = [];
    const cs: string[] = [];
    for (const [si, sp] of SPREADS.entries()) {
      const ts = v.per[si].ts, q = split(ts);
      const c = dailyCorr(LIVE[si], ts), c23 = dailyCorr(LIVE[si], ts, Date.UTC(2023, 0, 1), Date.UTC(2024, 0, 1) - 1);
      const r23 = ts.filter((x) => new Date(x.at).getUTCFullYear() === 2023).reduce((s, x) => s + x.r, 0);
      console.log(`    sp ${sp.toFixed(2)}: IS ${cell(q.a)} | OOS ${cell(q.b)} | 2023 ${r23 >= 0 ? "+" : ""}${r23.toFixed(1)}R · daily-R corr with live: all ${fx(c.all)} (shared days ${c.nShared}: ${fx(c.shared)}) · 2023 ${fx(c23.all)}`);
      cs.push(`${fx(c.all)}/${fx(c23.all)}`);
      if (si === 0) { console.log(`      ${"R sum / trades".padEnd(14)} ${Array.from({ length: 8 }, (_, i) => String(2019 + i).padStart(11)).join(" ")}`); console.log(yearRow("live", LIVE[0])); console.log(yearRow(idea.label, ts)); }
      console.log(`      null test (sp ${sp.toFixed(2)}, ${SEEDS} seeds):`);
      ps.push(nullTest(ts, sp));
    }
    const nullOk = ps.every((p) => p.all < 0.05 && p.a < 0.2 && p.b < 0.2);
    const ok = robust && plateau && nullOk;
    console.log(`    → ${idea.label}: cells passing ${nPass}/${vars.length} · plateau ${plateau ? "yes" : "no"} · null (p_all < 0.05, p_IS & p_OOS < 0.20 at both spreads) ${nullOk ? "yes" : "no"} → ${ok ? "CANDIDATE (portfolio check next)" : "REJECT"}`);
    summary.push(`${idea.key}) ${idea.label.padEnd(12)} cells ${String(nPass).padStart(2)}/${vars.length} | best ${v.name} | sp0.30 IS ${sR(v.per[0].a.avg)} PF ${fx(v.per[0].a.pf)} n${v.per[0].a.n} · OOS ${sR(v.per[0].b.avg)} PF ${fx(v.per[0].b.pf)} n${v.per[0].b.n} | sp0.50 IS ${sR(v.per[1].a.avg)} PF ${fx(v.per[1].a.pf)} · OOS ${sR(v.per[1].b.avg)} PF ${fx(v.per[1].b.pf)} | /wk ${fx(v.per[0].all.pw)} | p(all) ${ps.map((p) => p.all.toFixed(3)).join("/")} | corr all/2023 ${cs[0]} | ${ok ? "CANDIDATE" : "REJECT"}`);
    if (ok) adopt.push({ label: idea.label, v });
    bests.push({ label: `(info) ${idea.label}`, v });
  }

  // ── portfolio ──
  console.log("\nPORTFOLIO — live alone vs live + candidate at equal max closed-balance DD (base risk bisected; new setup at wNew × base risk; each period run alone from $1,500)");
  const evalPort = (name: string, base: Trade[][], add: Trade[][] | null, wNew: number) => {
    for (const [si, sp] of SPREADS.entries()) {
      const ts = add ? [...base[si], ...add[si]].sort((a, b) => a.entryT - b.entryT || a.at - b.at) : base[si];
      const e = evalAcc(ts, { ...LIVE_ACC, wNew });
      const row = [1, 2, 0].map((pi) => e[pi].eq.map((q, di) => `@${DD_TARGETS[di]}: ${q.pct.toFixed(2)}% CAGR ${q.cagr.toFixed(1).padStart(5)} DD ${q.dd.toFixed(1)} mo+ ${q.months.share.toFixed(0)}%`).join(" ; ")).join(" | ");
      console.log(`  ${(name + (add ? ` w${wNew}` : "")).padEnd(34)} sp ${sp.toFixed(2)} | ${row}`);
    }
  };
  console.log(`  columns: IS 19–22 | OOS 23→ | all — each: @DD target: base risk %, CAGR %, realised DD %, share of profitable months`);
  const SH = (ts: Trade[]) => ts;
  evalPort("live alone", LIVE.map(SH), null, 1);
  if (!adopt.length) {
    console.log("  no candidate survived the per-idea filters → nothing to add. For information, the best cell of each idea added at w0.5 / w1.0:");
  }
  const pool = adopt.length ? adopt : bests;
  for (const a of pool) for (const w of [0.5, 1]) evalPort(`+ ${a.label}`, LIVE, a.v.per.map((q) => q.ts), w);

  console.log("\nSUMMARY (best plateau cell per idea; p(all) at sp0.30/sp0.50; corr = daily-R correlation with live, all days / 2023)");
  for (const s of summary) console.log(`  ${s}`);
  return IDEAS;
}
/** Post-hoc plateau check of idea 1 (finer x toward 0, more buf / minT / maxD values), then null + equal-DD portfolio. */
function ext(LIVE: Trade[][]) {
  const vars = grid({ x: [0, 0.025, 0.05, 0.075, 0.1], win: ["LDN", "LDN+NY"], buf: [0.05, 0.1, 0.15], minT: [1, 1.25, 1.5], maxD: [25, 35, 50] }, sweep, "1-EXT) PDHL SWEEP — post-hoc finer grid (x toward 0, maxD = |D1| ceiling)");
  const lax = vars.filter((v) => v.per.every((q) => q.a.avg > 0 && q.b.avg > 0 && q.a.pf > 1.1 && q.b.pf > 1.1 && q.a.n >= MIN_N && q.b.n >= MIN_N));
  console.log(`  cells passing everything except the 0.3/wk frequency: ${lax.length} / ${vars.length}`);
  const { v, robust, plateau } = pick(vars);
  const named = vars.filter((u) => u.name === "x=0.05 win=LDN+NY buf=0.15 minT=1 maxD=35" || u.name === "x=0.05 win=LDN+NY buf=0.05 minT=1 maxD=35");
  for (const u of [v, ...named]) {
    console.log(`
  cell ${u.name} · passing ${u.robust} · neighbours ${u.nb}/${u.nbN} ${u === v ? (plateau ? "(plateau)" : "(no plateau)") : ""}`);
    for (const [si, sp] of SPREADS.entries()) {
      const ts = u.per[si].ts, c = dailyCorr(LIVE[si], ts), c23 = dailyCorr(LIVE[si], ts, Date.UTC(2023, 0, 1), Date.UTC(2024, 0, 1) - 1);
      console.log(`    sp ${sp.toFixed(2)}: IS ${cell(u.per[si].a)} | OOS ${cell(u.per[si].b)} | corr all ${fx(c.all)} · 2023 ${fx(c23.all)}`);
      if (si === 0) { console.log(yearRow("live", LIVE[0])); console.log(yearRow("sweep", ts)); }
      nullTest(ts, sp);
    }
    for (const w of [0.5, 1]) for (const [si, sp] of SPREADS.entries()) {
      const base = evalAcc(LIVE[si], LIVE_ACC), comb = evalAcc([...LIVE[si], ...u.per[si].ts].sort((a, b) => a.entryT - b.entryT || a.at - b.at), { ...LIVE_ACC, wNew: w });
      console.log(`    w${w} sp ${sp.toFixed(2)} | ${[1, 2].map((pi) => DD_TARGETS.map((_, di) => `${PERIODS[pi][0]}@${DD_TARGETS[di]} CAGR ${base[pi].eq[di].cagr.toFixed(1)}→${comb[pi].eq[di].cagr.toFixed(1)} mo+ ${base[pi].eq[di].months.share.toFixed(0)}→${comb[pi].eq[di].months.share.toFixed(0)}%`).join(" · ")).join(" | ")}`);
    }
  }
}
main();
