/**
 * Two candidate daytime (Asian-hours) setups next to the live three session breakouts, on the broker's candles
 * 2019 → (2019–2022 in-sample, 2023 → out-of-sample), at spreads $0.30 and $0.50. Machinery as in
 * scripts/improve-7-research.ts: daily / 4h scoreSeries aligned to closed bars, daily ATR, entry at the next bar's
 * open ± spread, stop checked first inside a bar, gaps fill at the open, $1,500 account at 1 % with overlapping trades.
 *   A) shanghai-open-breakout   range 00–01 UTC, breakouts 01–05 with daily & 4h, flat 07:00
 *   B) asian-sweep-reversion    range 00–02 UTC, a sweep and close back inside 02–06:30 → fade, flat 07:00
 *   npx tsx --env-file=.env scripts/daytime-setups-research.ts
 */
import { load } from "./broker-data";
import { alignClosed } from "../src/lib/bot/backtest";
import { atrSeries, type Candle } from "../src/lib/analysis/indicators";
import { scoreSeries } from "../src/lib/bot/strategy";
import { SESSION_RULES, type SessionRule } from "../src/lib/setup/sessionRules";

const M15 = 15 * 6e4, H = 36e5, WK = 7 * 864e5, CUT = Date.UTC(2023, 0, 1), SPREADS = [0.3, 0.5];

// ───────────────────────────── data ─────────────────────────────
type Ctx = { m15: Candle[]; t: number[]; daily: (number | null)[]; four: (number | null)[]; atrD: number[] };
function makeCtx(m15: Candle[], h4: Candle[], d1: Candle[]): Ctx {
  const dec = m15.map((c) => c.time.getTime() + M15);
  return {
    m15, t: m15.map((c) => c.time.getTime()),
    daily: alignClosed(dec, d1, scoreSeries(d1), "1day"), four: alignClosed(dec, h4, scoreSeries(h4), "4h"),
    atrD: alignClosed(dec, d1, atrSeries(d1), "1day").map((x) => x ?? NaN),
  };
}
const sgn = (x: number | null) => (x === null ? 0 : Math.sign(x));
const hourOf = (d: Date) => d.getUTCHours() + d.getUTCMinutes() / 60;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type Trade = { r: number; w: number; at: number; entryT: number; end: number; rule: string; side: number; j0: number; risk: number; tgtR: number; exitAt: number };

/** Bar by bar from the entry bar: time exit at the open, then stop (first, conservative; a gap fills at the open), then target. */
function walk(ctx: Ctx, j0: number, side: number, entry: number, stop: number, target: number, risk: number, exitAt: number) {
  const { m15, t } = ctx;
  const R = (px: number) => (side * (px - entry)) / risk;
  for (let j = j0; j < m15.length; j++) {
    const c = m15[j];
    if (t[j] >= exitAt) return { r: R(c.open), end: t[j] };
    if (side > 0 ? c.low <= stop : c.high >= stop) return { r: R(side > 0 ? Math.min(stop, c.open) : Math.max(stop, c.open)), end: t[j] + M15 };
    if (side > 0 ? c.high >= target : c.low <= target) return { r: R(target), end: t[j] + M15 };
  }
  return null;
}

// ───────────────────────────── live session rules (reference) ─────────────────────────────
function liveTrades(ctx: Ctx, rule: SessionRule, spread: number): Trade[] {
  const { m15, t } = ctx, out: Trade[] = [];
  let day = "", hi = -Infinity, lo = Infinity, n = 0, done = false;
  for (let i = 0; i < m15.length - 1; i++) {
    const b = m15[i], k = b.time.toISOString().slice(0, 10);
    if (k !== day) { day = k; hi = -Infinity; lo = Infinity; n = 0; done = false; }
    const h = hourOf(b.time);
    if (h >= rule.rangeFrom && h < rule.rangeTo) { hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); n++; continue; }
    if (done || h < rule.rangeTo || h >= rule.entryTo || n < rule.minBars) continue;
    const side = b.close > hi ? 1 : b.close < lo ? -1 : 0;
    if (!side) continue;
    const d = ctx.daily[i], f = ctx.four[i];
    if (sgn(d) !== side || sgn(f) !== side) continue;
    done = true;
    const mid = (hi + lo) / 2, R0 = Math.abs(b.close - mid);
    if (!(R0 >= rule.minStopAtr * ctx.atrD[i])) continue;
    if (rule.minDailyScore && Math.abs(d!) < rule.minDailyScore) continue;
    const nx = m15[i + 1];
    if (side * (nx.open - mid) <= 0) continue;
    const d0 = Date.parse(`${k}T00:00:00Z`), fri = new Date(d0).getUTCDay() === 5;
    const exitAt = rule.exit === "same20" || fri ? d0 + 20 * H : d0 + 31 * H;
    const entry = nx.open + side * spread, risk = side * (entry - mid);
    if (!(risk > 0.2)) continue;
    const res = walk(ctx, i + 1, side, entry, mid, entry + side * rule.rr * risk, risk, exitAt);
    if (res) out.push({ r: res.r, w: 1, at: t[i], entryT: t[i + 1], end: res.end, rule: rule.id, side, j0: i + 1, risk, tgtR: rule.rr, exitAt });
  }
  return out;
}
const livePortfolio = (ctx: Ctx, spread: number) => SESSION_RULES.flatMap((r) => liveTrades(ctx, r, spread));

// ───────────────────────────── A) shanghai-open-breakout ─────────────────────────────
type AP = { minD: number; stop: "mid" | "edge"; minStop: number; rr: number };
const A_DIMS = { minD: [0, 35, 50], stop: ["mid", "edge"] as const, minStop: [0.15, 0.2], rr: [1.5, 2, 2.5] };
function shanghai(ctx: Ctx, p: AP, spread: number): Trade[] {
  const { m15, t } = ctx, out: Trade[] = [];
  let day = "", hi = -Infinity, lo = Infinity, n = 0, done = false;
  for (let i = 0; i < m15.length - 1; i++) {
    const b = m15[i], k = b.time.toISOString().slice(0, 10);
    if (k !== day) { day = k; hi = -Infinity; lo = Infinity; n = 0; done = false; }
    const h = hourOf(b.time);
    if (h < 1) { hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); n++; continue; }
    if (done || h >= 5 || n < 3) continue;
    const side = b.close > hi ? 1 : b.close < lo ? -1 : 0;
    if (!side) continue;
    const d = ctx.daily[i], f = ctx.four[i];
    if (sgn(d) !== side || sgn(f) !== side) continue;
    done = true; // the first trend-side breakout decides the day
    if (Math.abs(d!) < p.minD) continue;
    const stop = p.stop === "mid" ? (hi + lo) / 2 : side > 0 ? lo : hi;
    if (!(Math.abs(b.close - stop) >= p.minStop * ctx.atrD[i])) continue;
    const exitAt = Date.parse(`${k}T07:00:00Z`);
    if (t[i + 1] >= exitAt) continue;
    const nx = m15[i + 1];
    if (side * (nx.open - stop) <= 0) continue;
    const entry = nx.open + side * spread, risk = side * (entry - stop);
    if (!(risk > 0.2)) continue;
    const res = walk(ctx, i + 1, side, entry, stop, entry + side * p.rr * risk, risk, exitAt);
    if (res) out.push({ r: res.r, w: 1, at: t[i], entryT: t[i + 1], end: res.end, rule: "shanghai-open-breakout", side, j0: i + 1, risk, tgtR: p.rr, exitAt });
  }
  return out;
}

// ───────────────────────────── B) asian-sweep-reversion ─────────────────────────────
type BP = { tgt: 1.5 | 2 | "edge"; filt: "none" | "4h<40"; mode: "skip-signal" | "end-day"; minStop: number };
const B_DIMS = { tgt: [1.5, 2, "edge"] as const, filt: ["none", "4h<40"] as const, mode: ["skip-signal", "end-day"] as const, minStop: [0.1, 0.15, 0.2] };
function sweep(ctx: Ctx, p: BP, spread: number): Trade[] {
  const { m15, t } = ctx, out: Trade[] = [];
  let day = "", hi = -Infinity, lo = Infinity, n = 0, done = false;
  for (let i = 0; i < m15.length - 1; i++) {
    const b = m15[i], k = b.time.toISOString().slice(0, 10);
    if (k !== day) { day = k; hi = -Infinity; lo = Infinity; n = 0; done = false; }
    const h = hourOf(b.time);
    if (h < 2) { hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); n++; continue; }
    if (done || h >= 6.5 || n < 6) continue;
    const up = b.high > hi && b.close < hi, dn = b.low < lo && b.close > lo;
    if (up === dn) continue; // none, or both in one bar
    const side = up ? -1 : 1;
    if (p.filt === "4h<40" && !(ctx.four[i] !== null && Math.abs(ctx.four[i]!) < 40)) continue;
    const fail = () => { if (p.mode === "end-day") done = true; };
    const atr = ctx.atrD[i];
    const stop = side < 0 ? b.high + 0.05 * atr : b.low - 0.05 * atr;
    if (!(Math.abs(b.close - stop) >= p.minStop * atr)) { fail(); continue; }
    const exitAt = Date.parse(`${k}T07:00:00Z`);
    if (t[i + 1] >= exitAt) { fail(); continue; }
    const entry = m15[i + 1].open + side * spread, risk = side * (entry - stop);
    if (!(risk > 0.2)) { fail(); continue; }
    const tgtR = p.tgt === "edge" ? (side * ((side > 0 ? hi : lo) - entry)) / risk : p.tgt;
    if (!(tgtR >= 1)) { fail(); continue; }
    done = true;
    const res = walk(ctx, i + 1, side, entry, stop, entry + side * tgtR * risk, risk, exitAt);
    if (res) out.push({ r: res.r, w: 1, at: t[i], entryT: t[i + 1], end: res.end, rule: "asian-sweep-reversion", side, j0: i + 1, risk, tgtR, exitAt });
  }
  return out;
}

// ───────────────────────────── metrics ─────────────────────────────
type St = { n: number; pw: number; win: number; avg: number; pf: number; dd: number; sum: number };
function stats(ts: Trade[], weeks: number): St {
  let w = 0, g = 0, l = 0, s = 0, pk = 0, dd = 0;
  for (const x of [...ts].sort((a, b) => a.at - b.at)) {
    const r = x.r * x.w;
    if (r > 0) { w++; g += r; } else l -= r;
    s += r; pk = Math.max(pk, s); dd = Math.max(dd, pk - s);
  }
  return { n: ts.length, pw: ts.length / weeks, win: ts.length ? (100 * w) / ts.length : 0, avg: ts.length ? s / ts.length : 0, pf: l > 0 ? g / l : Infinity, dd, sum: s };
}
function account(ts: Trade[], pct: number, start = 1500) {
  const ev = [...ts].sort((a, b) => a.entryT - b.entryT);
  let bal = start, pk = start, dd = 0;
  const open: { end: number; usd: number; r: number }[] = [];
  const closeUntil = (tm: number) => {
    open.sort((a, b) => a.end - b.end);
    while (open.length && open[0].end <= tm) { const p = open.shift()!; bal += p.usd * p.r; pk = Math.max(pk, bal); dd = Math.max(dd, (100 * (pk - bal)) / pk); }
  };
  for (const x of ev) { closeUntil(x.entryT); open.push({ end: x.end, usd: (pct / 100) * bal * x.w, r: x.r }); }
  closeUntil(Infinity);
  return { ret: (100 * (bal - start)) / start, dd };
}
const fx = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "inf");
const sR = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(3);
let T0 = 0, T1 = 0;
const split = (ts: Trade[]) => ({ a: stats(ts.filter((x) => x.at < CUT), (CUT - T0) / WK), b: stats(ts.filter((x) => x.at >= CUT), (T1 - CUT) / WK), all: stats(ts, (T1 - T0) / WK) });
const good = (s: St) => s.pf > 1.1 && s.avg > 0.05;
const MIN_N = 30; // a "robust" cell also needs at least this many trades in each period, else it is noise
const cell = (s: St) => `${String(s.n).padStart(4)} ${fx(s.pw).padStart(4)} ${s.win.toFixed(0).padStart(3)}% ${sR(s.avg)} ${fx(s.pf).padStart(5)} ${s.dd.toFixed(1).padStart(5)}`;
const CELLH = "   n  /wk win%   avgR    PF  DD R";

// ───────────────────────────── grid ─────────────────────────────
type Var<P> = { p: P; idx: number[]; name: string; per: { a: St; b: St; all: St; ts: Trade[] }[]; robust: boolean; minAvg: number; nb: number };
function grid<P>(ctx: Ctx, dims: Record<string, readonly (string | number)[]>, fn: (ctx: Ctx, p: P, s: number) => Trade[], label: string): Var<P>[] {
  const keys = Object.keys(dims);
  const combos: number[][] = [[]];
  for (const k of keys) { const nx: number[][] = []; for (const c of combos) dims[k].forEach((_, j) => nx.push([...c, j])); combos.splice(0, combos.length, ...nx); }
  const vars: Var<P>[] = combos.map((idx) => {
    const p = Object.fromEntries(keys.map((k, d) => [k, dims[k][idx[d]]])) as P;
    const per = SPREADS.map((s) => { const ts = fn(ctx, p, s); return { ...split(ts), ts }; });
    const robust = per.every((q) => good(q.a) && good(q.b) && q.a.n >= MIN_N && q.b.n >= MIN_N);
    return { p, idx, name: keys.map((k, d) => `${k}=${dims[k][idx[d]]}`).join(" "), per, robust, minAvg: Math.min(...per.flatMap((q) => [q.a.avg, q.b.avg])), nb: 0 };
  });
  for (const v of vars) {
    const nbs = vars.filter((u) => u !== v && u.idx.filter((x, d) => x !== v.idx[d]).length === 1 && u.idx.every((x, d) => Math.abs(x - v.idx[d]) <= 1));
    v.nb = nbs.filter((u) => u.robust).length;
    (v as Var<P> & { nbN?: number }).nbN = nbs.length;
  }
  console.log(`\n${label} — ${vars.length} variants · ** = PF > 1.1 and avg R > +0.05 in BOTH periods at BOTH spreads · nb = robust neighbours / neighbours`);
  console.log(`${"variant".padEnd(50)} | ${["spread 0.30 · 2019–22", "spread 0.30 · 2023→", "spread 0.50 · 2019–22", "spread 0.50 · 2023→"].map((x) => x.padEnd(CELLH.length)).join(" | ")} | nb`);
  console.log(`${"".padEnd(50)} | ${CELLH} | ${CELLH} | ${CELLH} | ${CELLH} |`);
  for (const v of vars) console.log(`${((v.robust ? "** " : "   ") + v.name).padEnd(50)} | ${cell(v.per[0].a)} | ${cell(v.per[0].b)} | ${cell(v.per[1].a)} | ${cell(v.per[1].b)} | ${v.nb}/${(v as Var<P> & { nbN?: number }).nbN}`);
  const nPos = vars.filter((v) => v.robust).length, nPosAnyN = vars.filter((v) => v.per.every((q) => good(q.a) && good(q.b))).length;
  const half = vars.filter((v) => v.per.every((q) => q.a.avg > 0 && q.b.avg > 0)).length;
  const pos30 = vars.filter((v) => good(v.per[0].a) && good(v.per[0].b)).length;
  console.log(`  robust in both periods at both spreads (n ≥ ${MIN_N} per period): ${nPos} / ${vars.length} · ignoring n: ${nPosAnyN} / ${vars.length} · at $0.30 only: ${pos30} / ${vars.length} · avg R > 0 in all four cells: ${half} / ${vars.length}`);
  console.log(`  IS→OOS consistency (spread 0.30): corr of avg R across variants 19–22 vs 23→ = ${corr(vars.map((v) => v.per[0].a.avg), vars.map((v) => v.per[0].b.avg)).toFixed(2)}`);
  return vars;
}
function corr(a: number[], b: number[]) {
  const n = a.length; if (n < 3) return NaN;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let c = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return c / Math.sqrt(va * vb);
}
function pick<P>(vars: Var<P>[]) {
  const rob = vars.filter((v) => v.robust);
  const pool = rob.length ? rob : vars.filter((v) => v.per.every((q) => q.a.n >= MIN_N && q.b.n >= MIN_N));
  return { v: [...pool].sort((x, y) => y.nb - x.nb || y.minAvg - x.minAvg)[0], robust: rob.length > 0 };
}

// ───────────────────────────── null hypothesis ─────────────────────────────
function mulberry(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
/** Same entry bar, same $ risk, same target multiple and time exit, side drawn at random (or flipped). */
function resim(ctx: Ctx, ts: Trade[], spread: number, sideOf: (x: Trade) => number): Trade[] {
  const out: Trade[] = [];
  for (const x of ts) {
    const side = sideOf(x), entry = ctx.m15[x.j0].open + side * spread, stop = entry - side * x.risk;
    const res = walk(ctx, x.j0, side, entry, stop, entry + side * x.tgtR * x.risk, x.risk, x.exitAt);
    if (res) out.push({ ...x, side, r: res.r, end: res.end });
  }
  return out;
}
function nullTest(ctx: Ctx, ts: Trade[], spread: number, seeds = 500) {
  const act = split(ts);
  const pf = { a: [] as number[], b: [] as number[], all: [] as number[] }, av = { a: [] as number[], b: [] as number[], all: [] as number[] };
  for (let s = 1; s <= seeds; s++) {
    const rnd = mulberry(s * 7919);
    const q = split(resim(ctx, ts, spread, () => (rnd() < 0.5 ? 1 : -1)));
    for (const k of ["a", "b", "all"] as const) { pf[k].push(Math.min(q[k].pf, 99)); av[k].push(q[k].avg); }
  }
  const flip = split(resim(ctx, ts, spread, (x) => -x.side));
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const pct = (v: number[], x: number) => v.filter((y) => y >= x).length / v.length;
  const q95 = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(0.95 * v.length)];
  for (const k of ["a", "b", "all"] as const) {
    const lab = k === "a" ? "19–22" : k === "b" ? "23→  " : "all  ";
    console.log(`    ${lab} actual PF ${fx(act[k].pf)} avg ${sR(act[k].avg)} | random side (${seeds} seeds): mean PF ${fx(mean(pf[k]))}, mean avg ${sR(mean(av[k]))}, 95th pct avg ${sR(q95(av[k]))}, p(random avg ≥ actual) = ${pct(av[k], act[k].avg).toFixed(3)} | flipped side: PF ${fx(flip[k].pf)} avg ${sR(flip[k].avg)}`);
  }
}

// ───────────────────────────── portfolio / correlation / years ─────────────────────────────
function portfolio(ref: Trade[], add: Trade[], label: string) {
  const rows: [string, Trade[]][] = [["current 3", ref], [`current 3 + ${label}`, [...ref, ...add]], [`${label} alone`, add]];
  console.log(`    ${"".padEnd(44)} | ${"19–22 ret%  DD%  ret/DD".padEnd(26)} | ${"23→ ret%  DD%  ret/DD".padEnd(26)} | all ret%   DD%  ret/DD | all PF / avgR / n`);
  for (const [n, ts] of rows) {
    const c = (xs: Trade[]) => { const a = account(xs, 1); return `${fx(a.ret, 0).padStart(6)}% ${a.dd.toFixed(1).padStart(5)}% ${(a.dd < 0.05 ? "inf" : fx(a.ret / a.dd, 1)).padStart(6)}`; };
    const s = stats(ts, 1);
    console.log(`    ${n.padEnd(44)} | ${c(ts.filter((x) => x.at < CUT)).padEnd(26)} | ${c(ts.filter((x) => x.at >= CUT)).padEnd(26)} | ${c(ts)} | ${fx(s.pf)} / ${sR(s.avg)} / ${s.n}`);
  }
}
function dailyCorr(ref: Trade[], add: Trade[]) {
  const sum = (ts: Trade[]) => { const m = new Map<string, number>(); for (const x of ts) m.set(dayKey(x.at), (m.get(dayKey(x.at)) ?? 0) + x.r * x.w); return m; };
  const A = sum(ref), B = sum(add);
  const both = [...B.keys()].filter((k) => A.has(k));
  const days: string[] = [];
  for (let d = Date.parse(dayKey(T0)); d <= T1; d += 864e5) { const wd = new Date(d).getUTCDay(); if (wd >= 1 && wd <= 5) days.push(dayKey(d)); }
  const sameSide = (() => { // share of shared days where the new trade and a current trade have the same side
    const sides = new Map<string, Set<number>>(); for (const x of ref) { const k = dayKey(x.at); if (!sides.has(k)) sides.set(k, new Set()); sides.get(k)!.add(x.side); }
    const sh = add.filter((x) => sides.has(dayKey(x.at))); return sh.length ? sh.filter((x) => sides.get(dayKey(x.at))!.has(x.side)).length / sh.length : NaN;
  })();
  console.log(`    daily-R correlation with current portfolio: shared trade days ${both.length} → r = ${corr(both.map((k) => A.get(k)!), both.map((k) => B.get(k)!)).toFixed(2)} (same side on ${(100 * sameSide).toFixed(0)}% of them) · all ${days.length} weekdays incl. zeros → r = ${corr(days.map((k) => A.get(k) ?? 0), days.map((k) => B.get(k) ?? 0)).toFixed(2)}`);
}
function years(ref: Trade[], add: Trade[], label: string) {
  const ys = Array.from({ length: 8 }, (_, i) => 2019 + i);
  const row = (n: string, ts: Trade[]) => console.log(`    ${n.padEnd(30)} ${ys.map((y) => { const q = ts.filter((x) => new Date(x.at).getUTCFullYear() === y); const s = q.reduce((a, x) => a + x.r * x.w, 0); return `${(s >= 0 ? "+" : "") + s.toFixed(1)}/${q.length}`.padStart(11); }).join(" ")}`);
  console.log(`    ${"R sum / trades".padEnd(30)} ${ys.map((y) => String(y).padStart(11)).join(" ")}`);
  row("current 3", ref); row(label, add); row("combined", [...ref, ...add]);
}

// ───────────────────────────── claim check: is 00–07 UTC range-bound? ─────────────────────────────
function regime(ctx: Ctx) {
  const wins: [string, number, number][] = [["00–07 UTC (08–15 UB/SGT)", 0, 7], ["07–12 UTC (London)", 7, 12], ["12–17 UTC (NY)", 12, 17], ["17–21 UTC (late)", 17, 21]];
  console.log("\nCLAIM CHECK — is 00:00–07:00 UTC (08:00–15:00 UTC+8) range-bound? 15m returns pooled per window (VR < 1 / AC1 < 0 = mean-reverting)");
  console.log(`  ${"window".padEnd(28)} | period | lag-1 autocorr | variance ratio VR(4) | VR(8) | efficiency |net move|/range | avg range / daily ATR`);
  for (const [name, a, b] of wins) for (const [pl, lo, hi] of [["19–22", 0, CUT], ["23→", CUT, Infinity]] as const) {
    const byDay = new Map<string, Candle[]>();
    ctx.m15.forEach((c, i) => { const h = hourOf(c.time), t = ctx.t[i]; if (h >= a && h < b && t >= lo && t < hi) { const k = dayKey(t); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k)!.push(c); } });
    const r1: number[] = [], pairs: [number, number][] = [], r4: number[] = [], r8: number[] = []; let eff = 0, rng = 0, nd = 0;
    const atrAt = new Map<string, number>(); ctx.m15.forEach((c, i) => { const k = dayKey(ctx.t[i]); if (!atrAt.has(k) && Number.isFinite(ctx.atrD[i])) atrAt.set(k, ctx.atrD[i]); });
    for (const [k, cs] of byDay) {
      if (cs.length < (b - a) * 4 - 2) continue;
      const rs = cs.map((c) => Math.log(c.close / c.open));
      rs.forEach((r, i) => { r1.push(r); if (i) pairs.push([rs[i - 1], r]); });
      for (let i = 0; i + 4 <= rs.length; i += 4) r4.push(rs.slice(i, i + 4).reduce((s, x) => s + x, 0));
      for (let i = 0; i + 8 <= rs.length; i += 8) r8.push(rs.slice(i, i + 8).reduce((s, x) => s + x, 0));
      const H_ = Math.max(...cs.map((c) => c.high)), L_ = Math.min(...cs.map((c) => c.low));
      if (H_ > L_) { eff += Math.abs(cs.at(-1)!.close - cs[0].open) / (H_ - L_); nd++; const at = atrAt.get(k); if (at) rng += (H_ - L_) / at; }
    }
    const v = (x: number[]) => { const m = x.reduce((s, y) => s + y, 0) / x.length; return x.reduce((s, y) => s + (y - m) ** 2, 0) / x.length; };
    const ac = corr(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    console.log(`  ${name.padEnd(28)} | ${pl.padEnd(6)} | ${ac.toFixed(3).padStart(14)} | ${(v(r4) / (4 * v(r1))).toFixed(3).padStart(20)} | ${(v(r8) / (8 * v(r1))).toFixed(3).padStart(5)} | ${(eff / nd).toFixed(3).padStart(28)} | ${(rng / nd).toFixed(2).padStart(10)}`);
  }
}

// ───────────────────────────── main ─────────────────────────────
function main() {
  const m15 = load("m15", "EU").filter((b) => b.time.getUTCFullYear() >= 2019), h4 = load("h4", "EU"), d1 = load("d1", "EU");
  const B = makeCtx(m15, h4, d1);
  T0 = B.t[0]; T1 = B.t.at(-1)!;
  console.log(`DATA: JustMarkets broker candles exported by mt5/tester/XauExport.mq5 (EU server clock → UTC), M15 ${dayKey(T0)} → ${dayKey(T1)}; spread modelled as a fixed $ added to the entry price (0.30 and 0.50), no news filter. Split ${dayKey(CUT)}.`);

  const REF: Record<number, Trade[]> = {};
  console.log("\nREFERENCE — live portfolio (3 session breakouts, NY rules |daily| ≥ 35). Target @0.30: 19–22 PF 1.41 +0.166R n216 · 23→ PF 1.57 +0.219R n325 · $1,500@1% +178%");
  for (const s of SPREADS) {
    const ts = livePortfolio(B, s); REF[s] = ts;
    const q = split(ts), acc = account(ts, 1);
    console.log(`  spread ${s.toFixed(2)} | 19–22 ${CELLH} | 23→ ${CELLH} | $1500@1% ret / DD`);
    console.log(`  ${"portfolio".padEnd(11)} | ${cell(q.a)}       | ${cell(q.b)}     | ${fx(acc.ret, 0)}% / ${acc.dd.toFixed(1)}%`);
    for (const r of SESSION_RULES) { const x = split(ts.filter((y) => y.rule === r.id)); console.log(`  ${r.id.slice(0, 11).padEnd(11)} | ${cell(x.a)}       | ${cell(x.b)}     |`); }
  }

  const A = grid<AP>(B, A_DIMS, shanghai, "A) SHANGHAI-OPEN-BREAKOUT — range 00–01 (≥3 bars), entries 01–05, daily & 4h agree, first trend-side close decides the day, flat 07:00");
  const S = grid<BP>(B, B_DIMS, sweep, "B) ASIAN-SWEEP-REVERSION — range 00–02 (≥6 bars), signals 02:00–06:30, stop = sweep extreme ± 0.05 ATR, 1 trade/day, flat 07:00 (minStop 0.15 = spec; 0.10/0.20 added for the plateau check)");

  for (const [label, vars] of [["shanghai-open-breakout", A], ["asian-sweep-reversion", S]] as const) {
    const { v, robust } = pick(vars as Var<unknown>[]);
    console.log(`\n${label.toUpperCase()} — ${robust ? "BEST ROBUST" : "NO ROBUST VARIANT; best by worst-cell avg R among cells with n ≥ 30 per period (for information only)"}: ${v.name} (robust neighbours ${v.nb})`);
    for (const [k, s] of SPREADS.entries()) {
      console.log(`  spread ${s.toFixed(2)}:`);
      portfolio(REF[s], v.per[k].ts, label);
      dailyCorr(REF[s], v.per[k].ts);
      years(REF[s], v.per[k].ts, label);
      console.log("    null hypothesis (same entries, random side):");
      nullTest(B, v.per[k].ts, s);
    }
    // the spec-default cell too, so the null test is not only run on a cherry-picked one
    const spec = label === "shanghai-open-breakout"
      ? vars.find((u) => u.name === "minD=0 stop=mid minStop=0.15 rr=2")
      : vars.find((u) => u.name === "tgt=2 filt=none mode=skip-signal minStop=0.15");
    if (spec && spec !== v) { console.log(`  spec-default cell ${spec.name}, spread 0.30, null hypothesis:`); nullTest(B, spec.per[0].ts, 0.3); }
  }
  // breakout vs reversion in the same window, side by side (all variants, spread 0.30)
  const sumUp = (vars: Var<unknown>[]) => { const m = (f: (v: Var<unknown>) => number) => vars.reduce((s, v) => s + f(v), 0) / vars.length; return `mean avg R 19–22 ${sR(m((v) => v.per[0].a.avg))} · 23→ ${sR(m((v) => v.per[0].b.avg))} · mean PF 19–22 ${fx(m((v) => Math.min(v.per[0].a.pf, 9)))} · 23→ ${fx(m((v) => Math.min(v.per[0].b.pf, 9)))}`; };
  console.log(`\nBREAKOUT vs REVERSION in Asian hours (grid means, spread 0.30): A ${sumUp(A as Var<unknown>[])}\n                                                          B ${sumUp(S as Var<unknown>[])}`);
  regime(B);
}
main();
