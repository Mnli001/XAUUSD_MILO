/**
 * Same-direction exposure caps on the live system (broker candles, JustMarkets, 2019 → ; 2019–2022 in-sample,
 * 2023 → out-of-sample), at spreads $0.30 and $0.50. Machinery copied from scripts/xau-alpha-research.ts: daily / 4h
 * scoreSeries aligned to CLOSED bars, daily ATR, entry at the next bar's open ± spread, stop checked first inside a
 * bar, gaps fill at the open, trades crossing an M15 hole > 4 days dropped, $1,500 account with overlapping
 * positions, DD on the closed-trade balance, base risk bisected to an equal max DD, CAGR over covered years.
 * Reference = live now: 3 session breakouts (NY |D1| ≥ 35) + conviction sizing (×1.25 when |D1| ≥ 65 and |4H| ≥ 65,
 * ×0.75 when either < 35), base risk 1 %. Variants decide each new trade from the positions open at its entry:
 *   a) max 1 open per direction   b) max 2 per direction   c) 2nd same-direction ×0.5, 3rd ×0.5 / skip
 *   d) total open risk ≤ 1.5× / 2× base risk: skip or shrink to fit   e) skip a trade opposite an open one
 *   npx tsx --env-file=.env scripts/exposure-cap-research.ts
 */
import { load } from "./broker-data";
import { alignClosed } from "../src/lib/bot/backtest";
import { atrSeries, type Candle } from "../src/lib/analysis/indicators";
import { scoreSeries } from "../src/lib/bot/strategy";
import { SESSION_RULES, sizeFactor, type SessionRule } from "../src/lib/setup/sessionRules";

const M15 = 15 * 6e4, H = 36e5, DAY = 864e5, WK = 7 * DAY, YR = 365.25 * DAY, CUT = Date.UTC(2023, 0, 1);
const START = 1500, DD_TARGETS = [11.1, 15.0], SPREADS = [0.3, 0.5];

// ───────────────────────────── data ─────────────────────────────
type Ctx = { m15: Candle[]; t: number[]; daily: (number | null)[]; four: (number | null)[]; atrD: number[] };
let CTX: Ctx, T0 = 0, T1 = 0, DROP_HOLES = true;
const HOLE = 4 * DAY;
const sgn = (x: number | null) => (x === null ? 0 : Math.sign(x));
const hourOf = (d: Date) => d.getUTCHours() + d.getUTCMinutes() / 60;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
function idx15(ms: number) { let lo = 0, hi = CTX.t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (CTX.t[m] < ms) lo = m + 1; else hi = m; } return lo; }

type Trade = { r: number; at: number; entryT: number; end: number; rule: string; side: number; entry: number; risk: number; d1: number; h4: number; wx?: number };

function walk(j0: number, side: number, entry: number, stop: number, target: number, risk: number, exitAt: number) {
  const { m15, t } = CTX, R = (px: number) => (side * (px - entry)) / risk;
  for (let j = j0; j < m15.length; j++) {
    const c = m15[j];
    if (DROP_HOLES && j > j0 && t[j] - t[j - 1] > HOLE) return null;
    if (t[j] >= exitAt) return { r: R(c.open), end: t[j] };
    if (side > 0 ? c.low <= stop : c.high >= stop) return { r: R(side > 0 ? Math.min(stop, c.open) : Math.max(stop, c.open)), end: t[j] + M15 };
    if (side > 0 ? c.high >= target : c.low <= target) return { r: R(target), end: t[j] + M15 };
  }
  return null;
}
function liveTrades(rule: SessionRule, spread: number): Trade[] {
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
    const nx = m15[i + 1];
    if (side * (nx.open - mid) <= 0) continue;
    const d0 = Date.parse(`${k}T00:00:00Z`), fri = new Date(d0).getUTCDay() === 5;
    const exitAt = rule.exit === "same20" || fri ? d0 + 20 * H : d0 + 31 * H;
    const entry = nx.open + side * spread, risk = side * (entry - mid);
    if (!(risk > 0.2)) continue;
    const res = walk(i + 1, side, entry, mid, entry + side * rule.rr * risk, risk, exitAt);
    if (res) out.push({ r: res.r, at: t[i], entryT: t[i + 1], end: res.end, rule: rule.id, side, entry, risk, d1: d!, h4: f! });
  }
  return out;
}
const live = (spread: number) => SESSION_RULES.flatMap((r) => liveTrades(r, spread)).sort((a, b) => a.entryT - b.entryT || a.at - b.at);

// ───────────────────────────── policy ─────────────────────────────
type Pol = {
  name: string; conv?: boolean;
  maxSame?: number; // max open positions in the trade's direction before it (a new one is skipped at this count)
  sameW?: number[]; // multiplier for the 2nd, 3rd … same-direction position (0 = skip)
  cap?: number; capMode?: "skip" | "shrink"; capSame?: boolean; // total (or same-direction) open initial risk ≤ cap × base risk
  skipOpp?: boolean; // skip a trade opposite to an open position
};
type Open = { side: number; usd: number };
const MIN_FIT = 0.1; // a shrunk trade below 0.1× base risk is skipped
/** Size multiple of base risk for x given the open positions; 0 = skip. */
function decide(x: Trade, open: Open[], bal: number, pct: number, p: Pol): number {
  let w = (p.conv === false ? 1 : sizeFactor(x.d1, x.h4)) * (x.wx ?? 1);
  const same = open.filter((o) => o.side === x.side).length, opp = open.length - same;
  if (p.skipOpp && opp > 0) return 0;
  if (p.maxSame !== undefined && same >= p.maxSame) return 0;
  if (p.sameW && same > 0) { w *= p.sameW[Math.min(same, p.sameW.length) - 1]; if (w <= 0) return 0; }
  if (p.cap !== undefined) {
    const base = (pct / 100) * bal, used = open.filter((o) => !p.capSame || o.side === x.side).reduce((s, o) => s + o.usd, 0) / base;
    if (used + w > p.cap + 1e-9) {
      if (p.capMode === "skip") return 0;
      w = p.cap - used;
      if (w < MIN_FIT) return 0;
    }
  }
  return w;
}

// ───────────────────────────── account ─────────────────────────────
/** Closed-balance account; positions overlap; returns DD, final balance and the size multiple given to each trade. */
function account(ts: Trade[], pct: number, p: Pol) {
  let bal = START, pk = START, dd = 0;
  const open: (Open & { end: number; r: number })[] = [], w: number[] = [];
  const closeUntil = (tm: number) => {
    open.sort((a, b) => a.end - b.end);
    while (open.length && open[0].end <= tm) { const q = open.shift()!; bal += q.usd * q.r; pk = Math.max(pk, bal); dd = Math.max(dd, (100 * (pk - bal)) / pk); }
  };
  for (const x of ts) {
    closeUntil(x.entryT);
    const k = decide(x, open, bal, pct, p);
    w.push(k);
    if (k > 0) open.push({ end: x.end, usd: (pct / 100) * bal * k, r: x.r, side: x.side });
  }
  closeUntil(Infinity);
  return { ret: (100 * (bal - START)) / START, dd, bal, w };
}
/** Same account marked to market on every 15m close. */
function mtmDD(ts: Trade[], pct: number, p: Pol) {
  const { m15, t } = CTX;
  let bal = START, eqPk = START, mdd = 0, k = 0;
  let open: { x: Trade; usd: number }[] = [];
  for (let b = idx15(ts[0]?.entryT ?? 0); b < m15.length && (k < ts.length || open.length); b++) {
    const tb = t[b], keep: typeof open = [];
    for (const o of open.sort((a, c) => a.x.end - c.x.end)) { if (o.x.end <= tb) bal += o.usd * o.x.r; else keep.push(o); }
    open = keep;
    while (k < ts.length && ts[k].entryT <= tb) {
      const x = ts[k++], w = decide(x, open.map((o) => ({ side: o.x.side, usd: o.usd })), bal, pct, p);
      if (w > 0) open.push({ x, usd: (pct / 100) * bal * w });
    }
    let eq = bal;
    for (const o of open) eq += o.x.end <= tb + M15 ? o.usd * o.x.r : (o.usd * o.x.side * (m15[b].close - o.x.entry)) / o.x.risk;
    eqPk = Math.max(eqPk, eq); mdd = Math.max(mdd, (100 * (eqPk - eq)) / eqPk);
  }
  return mdd;
}
function eqRisk(ts: Trade[], target: number, p: Pol) {
  let lo = 0.01, hi = 25;
  if (account(ts, hi, p).dd < target) return hi;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (account(ts, m, p).dd < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

function mulberry(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

// ───────────────────────────── evaluation ─────────────────────────────
let YEARS = [1, 1, 1];
const PERIODS: [string, (x: Trade) => boolean][] = [["all", () => true], ["IS 19–22", (x) => x.at < CUT], ["OOS 23→", (x) => x.at >= CUT]];
type PerRes = { n: number; skip: number; avg: number; wavg: number; pf: number; r1: { ret: number; dd: number }; eq: { pct: number; cagr: number; ret: number }[]; skipAvg: number };
function evalPol(ts: Trade[], p: Pol): PerRes[] {
  return PERIODS.map(([, f], pi) => {
    const q = ts.filter(f), a1 = account(q, 1, p), yrs = YEARS[pi];
    const taken = q.filter((_, i) => a1.w[i] > 0), skipped = q.filter((_, i) => a1.w[i] === 0);
    let g = 0, l = 0, s = 0, ws = 0, wsum = 0;
    q.forEach((x, i) => { const w = a1.w[i]; if (w <= 0) return; if (x.r > 0) g += x.r; else l -= x.r; s += x.r; ws += w * x.r; wsum += w; });
    const eq = DD_TARGETS.map((d) => { const pct = eqRisk(q, d, p), a = account(q, pct, p); return { pct, ret: a.ret, cagr: 100 * (Math.pow(a.bal / START, 1 / yrs) - 1) }; });
    return { n: taken.length, skip: skipped.length, avg: taken.length ? s / taken.length : 0, wavg: wsum ? ws / wsum : 0, pf: l > 0 ? g / l : Infinity, r1: { ret: a1.ret, dd: a1.dd }, eq, skipAvg: skipped.length ? skipped.reduce((z, x) => z + x.r, 0) / skipped.length : NaN };
  });
}
const fx = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "  -  ");
const sR = (x: number) => (Number.isFinite(x) ? (x >= 0 ? "+" : "") + x.toFixed(3) : "   -  ");
const pc = (x: number, d = 0) => (x >= 0 ? "+" : "") + x.toFixed(d) + "%";

function main() {
  const m15 = load("m15", "EU").filter((b) => b.time.getUTCFullYear() >= 2019), h4 = load("h4", "EU"), d1 = load("d1", "EU");
  const dec = m15.map((c) => c.time.getTime() + M15);
  CTX = { m15, t: m15.map((c) => c.time.getTime()), daily: alignClosed(dec, d1, scoreSeries(d1), "1day"), four: alignClosed(dec, h4, scoreSeries(h4), "4h"), atrD: alignClosed(dec, d1, atrSeries(d1), "1day").map((x) => x ?? NaN) };
  T0 = CTX.t[0]; T1 = CTX.t.at(-1)!;
  const A0 = Date.UTC(2018, 11, 31), wk = new Map<number, number>();
  for (const x of CTX.t) { const k = Math.floor((x - A0) / WK); wk.set(k, (wk.get(k) ?? 0) + 1); }
  const covered = (a: number, b: number) => ([...wk].filter(([k, n]) => n >= 300 && A0 + k * WK >= a && A0 + k * WK < b).length * WK) / YR;
  YEARS = [covered(T0, T1 + 1), covered(T0, CUT), covered(CUT, T1 + 1)];
  console.log(`DATA: JustMarkets broker M15 ${dayKey(T0)} → ${dayKey(T1)} (${m15.length} bars), H4 ${h4.length}, D1 ${d1.length}. IS < 2023-01-01 ≤ OOS. Covered years all ${YEARS[0].toFixed(2)} / IS ${YEARS[1].toFixed(2)} / OOS ${YEARS[2].toFixed(2)} (CAGR base). Trades crossing an M15 hole > 4 days dropped.`);

  const REF: Pol = { name: "REF live: 3 setups + conviction 1.25/0.75", conv: true };
  const NOCONV: Pol = { name: "live 3 setups, flat 1x (pre-conviction)", conv: false };
  const TS = SPREADS.map(live);

  // ── reproduction ──
  console.log("\nREPRODUCTION (expected flat-size @0.30 from xau-alpha-research: IS PF 1.41 +0.166R n216 · OOS PF 1.57 +0.219R n325 · $1500@1% ≈ +178% DD 11.1% (holes kept))");
  { DROP_HOLES = false; const raw = live(0.3), a = account(raw, 1, NOCONV); console.log(`  holes kept, flat 1x @0.30: n ${raw.length} · $1500@1% ${pc(a.ret)} DD ${a.dd.toFixed(1)}%`); DROP_HOLES = true; }
  for (const [si, sp] of SPREADS.entries()) for (const p of [NOCONV, REF]) {
    const e = evalPol(TS[si], p);
    console.log(`  sp ${sp.toFixed(2)} ${p.name.padEnd(42)} IS n${e[1].n} ${sR(e[1].avg)} PF ${fx(e[1].pf)} | OOS n${e[2].n} ${sR(e[2].avg)} PF ${fx(e[2].pf)} | all @1% ${pc(e[0].r1.ret)} DD ${e[0].r1.dd.toFixed(1)}% | CAGR@11.1 IS ${e[1].eq[0].cagr.toFixed(1)} OOS ${e[2].eq[0].cagr.toFixed(1)}`);
  }

  // ── overlap census ──
  console.log("\nOVERLAP CENSUS (all trades, sp 0.30): positions already open at each entry");
  {
    const ts = TS[0], cnt = new Map<string, number>(), rs = new Map<string, number[]>();
    ts.forEach((x) => {
      const op = ts.filter((y) => y !== x && y.entryT < x.entryT && y.end > x.entryT);
      const s = op.filter((y) => y.side === x.side).length, o = op.length - s, k = `same ${s} / opp ${o}`;
      cnt.set(k, (cnt.get(k) ?? 0) + 1); (rs.get(k) ?? rs.set(k, []).get(k)!).push(x.r);
    });
    for (const [k, n] of [...cnt].sort()) {
      const r = rs.get(k)!;
      console.log(`  ${k.padEnd(16)} ${String(n).padStart(4)} trades · avg R ${sR(r.reduce((a, b) => a + b, 0) / r.length)}`);
    }
    const pair = new Map<string, number>();
    ts.forEach((x) => ts.forEach((y) => { if (y.entryT < x.entryT && y.end > x.entryT) { const k = `${y.rule} open → ${x.rule} ${y.side === x.side ? "same" : "opp"}`; pair.set(k, (pair.get(k) ?? 0) + 1); } }));
    for (const [k, n] of [...pair].sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(54)} ${n}`);
  }

  const POLS: Pol[] = [
    REF,
    { name: "a) max 1 open per direction", maxSame: 1 },
    { name: "b) max 2 open per direction", maxSame: 2 },
    { name: "c1) 2nd same-dir x0.5, 3rd x0.5", sameW: [0.5, 0.5] },
    { name: "c2) 2nd same-dir x0.5, 3rd skip", sameW: [0.5, 0] },
    { name: "d1) total open risk <=1.5x, skip", cap: 1.5, capMode: "skip" },
    { name: "d2) total open risk <=1.5x, shrink", cap: 1.5, capMode: "shrink" },
    { name: "d3) total open risk <=2.0x, skip", cap: 2.0, capMode: "skip" },
    { name: "d4) total open risk <=2.0x, shrink", cap: 2.0, capMode: "shrink" },
    { name: "e) skip trade opposite an open one", skipOpp: true },
    { name: "e+a) skip opposite + max 1 same", skipOpp: true, maxSame: 1 },
    { name: "x) same-dir open risk <=1.5x, shrink", cap: 1.5, capMode: "shrink", capSame: true },
  ];
  const RES = POLS.map((p) => SPREADS.map((_, si) => evalPol(TS[si], p)));

  // ── full table ──
  for (const [si, sp] of SPREADS.entries()) {
    console.log(`\nFULL TABLE — spread $${sp.toFixed(2)} (each period run alone from $1,500; n = trades taken, skip = trades skipped, avgR/PF on taken trades (unweighted), wR = size-weighted avg R, skR = avg R of skipped trades)`);
    for (const [pi, [pn]] of PERIODS.entries()) {
      console.log(`  ${pn.padEnd(40)} |   n skip   avgR    wR    PF   skR  | @1%  ret%    DD%  r/DD | @DD11.1 risk%  CAGR%   total% | @DD15 risk%  CAGR%   total%`);
      for (const [vi, p] of POLS.entries()) {
        const e = RES[vi][si][pi];
        const eqs = e.eq.map((x) => `${x.pct.toFixed(2).padStart(6)} ${x.cagr.toFixed(1).padStart(6)} ${pc(x.ret).padStart(8)}`).join(" |     ");
        console.log(`  ${p.name.padEnd(40)} | ${String(e.n).padStart(3)} ${String(e.skip).padStart(4)} ${sR(e.avg)} ${sR(e.wavg)} ${fx(e.pf).padStart(5)} ${sR(e.skipAvg)} | ${pc(e.r1.ret).padStart(7)} ${e.r1.dd.toFixed(1).padStart(5)}% ${fx(e.r1.ret / e.r1.dd, 1).padStart(5)} |       ${eqs}`);
      }
    }
  }

  // ── verdict ──
  console.log("\nVERDICT — equal-DD CAGR vs REF, IS and OOS, both spreads, both DD targets (8 cells; pass = all 8 better)");
  console.log(`  ${"variant".padEnd(40)} | ${SPREADS.map((s) => `sp${s.toFixed(2)} IS@11.1  OOS@11.1  IS@15   OOS@15`).join(" | ")} | wins | result`);
  const verdicts: { p: Pol; ok: boolean; wins: number; minGain: number }[] = [];
  for (const [vi, p] of POLS.entries()) {
    let wins = 0, minGain = Infinity;
    const cells = SPREADS.map((_, si) => [[1, 0], [2, 0], [1, 1], [2, 1]].map(([pi, di]) => {
      const a = RES[vi][si][pi].eq[di].cagr, b = RES[0][si][pi].eq[di].cagr, d = a - b;
      if (d > 0) wins++; minGain = Math.min(minGain, d);
      return `${a.toFixed(1)}(${d >= 0 ? "+" : ""}${d.toFixed(1)})`.padStart(10);
    }).join(" ")).join(" | ");
    const ok = vi > 0 && wins === 8;
    if (vi > 0) verdicts.push({ p, ok, wins, minGain });
    console.log(`  ${p.name.padEnd(40)} | ${cells} | ${vi ? `${wins}/8` : " ref"} | ${vi ? (ok ? "PASS" : "fail") : ""}`);
  }
  const best = [...verdicts].sort((a, b) => b.wins - a.wins || b.minGain - a.minGain)[0];
  const passed = verdicts.filter((v) => v.ok);
  console.log(`\n  passing: ${passed.length ? passed.map((v) => v.p.name).join("; ") : "none"} · best by wins / worst-cell gain: ${best.p.name} (${best.wins}/8, worst cell ${best.minGain >= 0 ? "+" : ""}${best.minGain.toFixed(2)} pts)`);

  // ── robustness of c) ──
  console.log("\nROBUSTNESS c) — multiplier for the 2nd / 3rd concurrent same-direction trade: CAGR gain vs REF (pts) [sp0.30 IS@11.1 OOS@11.1 IS@15 OOS@15 | sp0.50 …]");
  const fam: [number, number][] = [[0.25, 0.25], [0.4, 0.4], [0.5, 0.5], [0.6, 0.6], [0.75, 0.75], [0.5, 0.25], [0.5, 1], [0.75, 0.5]];
  let famPass = 0;
  for (const [w2, w3] of fam) {
    const p: Pol = { name: `2nd x${w2}, 3rd x${w3}`, sameW: [w2, w3] };
    let wins = 0;
    const g = SPREADS.map((_, si) => { const e = evalPol(TS[si], p); return [[1, 0], [2, 0], [1, 1], [2, 1]].map(([pi, di]) => { const d = e[pi].eq[di].cagr - RES[0][si][pi].eq[di].cagr; if (d > 0) wins++; return `${d >= 0 ? "+" : ""}${d.toFixed(1)}`.padStart(6); }).join(""); }).join(" | ");
    if (wins === 8) famPass++;
    console.log(`  ${p.name.padEnd(22)} ${g} | ${wins}/8`);
  }
  console.log(`  family cells passing 8/8: ${famPass} / ${fam.length}`);
  {
    // which 2nd trades: avg R by the pair (open rule → new rule), IS → OOS, sp 0.30
    const ts = TS[0], m = new Map<string, Trade[]>();
    ts.forEach((x) => { const op = ts.filter((y) => y !== x && y.entryT < x.entryT && y.end > x.entryT && y.side === x.side); if (op.length) { const k = `${op.map((y) => y.rule.replace("-breakout", "")).join("+")} → ${x.rule.replace("-breakout", "")}`; (m.get(k) ?? m.set(k, []).get(k)!).push(x); } });
    console.log("  2nd/3rd trades by pair, sp 0.30: n / avg R IS → OOS");
    const av = (q: Trade[]) => (q.length ? q.reduce((s, x) => s + x.r, 0) / q.length : NaN);
    for (const [k, q] of m) { const a = q.filter((x) => x.at < CUT), b = q.filter((x) => x.at >= CUT); console.log(`    ${k.padEnd(30)} ${String(a.length).padStart(3)} ${sR(av(a))} → ${String(b.length).padStart(3)} ${sR(av(b))}`); }
    // the open first trade's outcome vs the 2nd trade's: same-day correlation
    const pairs: [number, number][] = [];
    ts.forEach((x) => { const y = ts.find((z) => z !== x && z.entryT < x.entryT && z.end > x.entryT && z.side === x.side); if (y) pairs.push([y.r, x.r]); });
    const n = pairs.length, ma = pairs.reduce((s, p) => s + p[0], 0) / n, mb = pairs.reduce((s, p) => s + p[1], 0) / n;
    const c = pairs.reduce((s, p) => s + (p[0] - ma) * (p[1] - mb), 0) / Math.sqrt(pairs.reduce((s, p) => s + (p[0] - ma) ** 2, 0) * pairs.reduce((s, p) => s + (p[1] - mb) ** 2, 0));
    console.log(`  R correlation between the open trade and the concurrent same-direction trade: r = ${c.toFixed(2)} (n ${n}); both lose in ${pairs.filter((p) => p[0] < 0 && p[1] < 0).length} of ${n}`);
  }
  // shuffle null: halve the same NUMBER of trades chosen at random (within each period) instead of the concurrent ones
  console.log("\n  NULL — x0.5 on the same number of randomly chosen trades per period (300 seeds), CAGR gain @DD 11.1% vs REF");
  for (const [si, sp] of SPREADS.entries()) {
    const parts = [1, 2].map((pi) => {
      const q = TS[si].filter(PERIODS[pi][1]), yrs = YEARS[pi], C1: Pol = { name: "", sameW: [0.5, 0.5] };
      const cg = (p: Pol, ts: Trade[]) => { const pct = eqRisk(ts, 11.1, p), a = account(ts, pct, p); return 100 * (Math.pow(a.bal / START, 1 / yrs) - 1); };
      const base = cg(REF, q), wc = account(q, 1, C1).w, refw = account(q, 1, REF).w, nHalf = wc.filter((w, i) => w < refw[i] - 1e-9).length;
      const act = cg(C1, q) - base, rnd = mulberry(77 + pi + 10 * si), sims: number[] = [];
      for (let s = 0; s < 300; s++) {
        const idx = q.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
        const half = new Set(idx.slice(0, nHalf));
        sims.push(cg(REF, q.map((x, i) => (half.has(i) ? { ...x, wx: 0.5 } : x))) - base);
      }
      const mean = sims.reduce((s, v) => s + v, 0) / sims.length;
      return `${PERIODS[pi][0]}: halved ${nHalf}, actual ${act >= 0 ? "+" : ""}${act.toFixed(1)}, random mean ${mean >= 0 ? "+" : ""}${mean.toFixed(1)}, p = ${(sims.filter((v) => v >= act).length / sims.length).toFixed(3)}`;
    });
    console.log(`    sp ${sp.toFixed(2)} | ${parts.join(" | ")}`);
  }

  // ── mark-to-market DD ──
  console.log("\nMARK-TO-MARKET DD (all years; at 1% base and at the risk that gives 11.1% closed-balance DD on all years)");
  for (const p of [REF, best.p]) for (const [si, sp] of SPREADS.entries()) {
    const e = RES[POLS.indexOf(p)][si][0];
    console.log(`  ${p.name.padEnd(40)} sp ${sp.toFixed(2)} | closed DD @1% ${e.r1.dd.toFixed(1)}% · MTM DD @1% ${mtmDD(TS[si], 1, p).toFixed(1)}% | risk ${e.eq[0].pct.toFixed(2)}%: closed 11.1% · MTM ${mtmDD(TS[si], e.eq[0].pct, p).toFixed(1)}%`);
  }
}
main();
