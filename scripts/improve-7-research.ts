/**
 * Seven critique claims about the three session-range breakouts, each tested alone against the live rules, then the
 * best combination. Broker history 2019 → (2019–2022 in-sample, 2023 → out-of-sample). News is stored only from late
 * 2023, so news-dependent rows are judged on that window only, on the broker's candles AND on the site's own candles.
 *   npx tsx --env-file=.env scripts/improve-7-research.ts
 */
import { load } from "./broker-data";
import { alignClosed } from "../src/lib/bot/backtest";
import { atrSeries, type Candle } from "../src/lib/analysis/indicators";
import { scoreSeries } from "../src/lib/bot/strategy";
import { SESSION_RULES, type SessionRule } from "../src/lib/setup/sessionRules";
import { loadBacktestData } from "../src/lib/bot/run";
import { closeDb } from "../src/lib/db";

const M15 = 15 * 6e4, H = 36e5, WK = 7 * 864e5, SPREAD = 0.3, BUF = 0.3, CUT = Date.UTC(2023, 0, 1);

// ───────────────────────────── data ─────────────────────────────
type Ctx = { m15: Candle[]; t: number[]; daily: (number | null)[]; four: (number | null)[]; atrD: number[]; news: number[] };
function makeCtx(m15: Candle[], h4: Candle[], d1: Candle[], news: number[]): Ctx {
  const dec = m15.map((c) => c.time.getTime() + M15);
  return {
    m15, t: m15.map((c) => c.time.getTime()),
    daily: alignClosed(dec, d1, scoreSeries(d1), "1day"), four: alignClosed(dec, h4, scoreSeries(h4), "4h"),
    atrD: alignClosed(dec, d1, atrSeries(d1), "1day").map((x) => x ?? NaN),
    news: [...news].sort((a, b) => a - b),
  };
}
const sgn = (x: number | null) => (x === null ? 0 : Math.sign(x));
/** US daylight time: second Sunday of March 07:00 UTC → first Sunday of November 06:00 UTC. */
const usDst = (ms: number) => {
  const y = new Date(ms).getUTCFullYear();
  const a = new Date(Date.UTC(y, 2, 1, 7)); a.setUTCDate(1 + ((7 - a.getUTCDay()) % 7) + 7);
  const b = new Date(Date.UTC(y, 10, 1, 6)); b.setUTCDate(1 + ((7 - b.getUTCDay()) % 7));
  return ms >= a.getTime() && ms < b.getTime();
};
const inNews = (ctx: Ctx, at: number) => {
  // 30 min before – 60 min after a HIGH release (the live rule)
  for (const n of ctx.news) { if (n - 30 * 6e4 > at) break; if (at <= n + 60 * 6e4) return true; }
  return false;
};
/** A HIGH release 15 minutes after a moment inside this bar ([open+15m, open+30m) holds a release). */
const newsSoon = (ctx: Ctx, barT: number) => ctx.news.some((n) => n - 15 * 6e4 >= barT && n - 15 * 6e4 < barT + M15);

// ───────────────────────────── variants ─────────────────────────────
type Opts = {
  nyLocalOpen?: boolean; // only ny-open in New York time
  delay?: number; // enter this many bars late (latency test for the slip rule)
  nyLocal?: boolean; // NY rules in New York time (08:30–09:30 / 09:30–10:30 local), entry/exit hours shifted alike
  minScore?: number; dailyOnly?: boolean; // |score| ≥ T (both or daily only)
  maxStopAtr?: number; // skip when stop distance > k × daily ATR
  maxExt?: number; // skip when the breakout close is beyond the range edge by > m × range width
  be?: number; // stop to entry + 0.3 once +X R, from the next bar
  partial?: number; // close 50 % at +X R, rest to the target
  rrAsian?: number;
  nyLateSame20?: boolean;
  newsSkip?: boolean; // breakout inside a news window ends the day for that range (live rule)
  newsProtect?: "be" | "close"; // open trade in profit 15 min before a HIGH release
  slip?: number; // skip when the next open is already > slip R past the breakout close (robot rule = 0.3)
  against?: boolean; // skip when the next open is back inside the range or > 0.25 R against
  limit?: { x: number; keepTp?: boolean }; // limit x R back toward the range, 4 bars to fill
  rules?: string[];
  noDup?: boolean; // drop a ny-late trade entered on the same bar and side as a ny-open trade
  scoreNyOnly?: boolean; // the score threshold applies to the NY rules only
  lateAlone?: boolean; // ny-late only on days ny-open took no trade
};
type Trade = { r: number; w: number; at: number; entryT: number; end: number; rule: string; side: number };

function rulesOf(o: Opts): SessionRule[] {
  return SESSION_RULES.filter((r) => !o.rules || o.rules.includes(r.id)).map((r) => ({
    ...r,
    rr: r.id === "asian-breakout" && o.rrAsian ? o.rrAsian : r.rr,
    exit: r.id === "ny-late-breakout" && o.nyLateSame20 ? "same20" : r.exit,
  }));
}

function trades(ctx: Ctx, rule: SessionRule, o: Opts): Trade[] {
  const { m15, t } = ctx, out: Trade[] = [];
  const ny = (o.nyLocal && rule.id !== "asian-breakout") || (o.nyLocalOpen && rule.id === "ny-open-breakout");
  let day = "", hi = -Infinity, lo = Infinity, n = 0, done = false, shift = 0;
  for (let i = 0; i < m15.length - 1; i++) {
    const b = m15[i], k = b.time.toISOString().slice(0, 10);
    if (k !== day) { day = k; hi = -Infinity; lo = Infinity; n = 0; done = false; shift = ny && !usDst(Date.parse(`${k}T12:00:00Z`)) ? 1 : 0; }
    const h = b.time.getUTCHours() + b.time.getUTCMinutes() / 60 - shift;
    if (h >= rule.rangeFrom && h < rule.rangeTo) { hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); n++; continue; }
    if (done || h < rule.rangeTo || h >= rule.entryTo || n < rule.minBars) continue;
    const side = b.close > hi ? 1 : b.close < lo ? -1 : 0;
    if (!side) continue;
    const d = ctx.daily[i], f = ctx.four[i];
    if (sgn(d) !== side || sgn(f) !== side) continue;
    done = true;
    if (o.newsSkip && inNews(ctx, t[i] + M15)) continue;
    const mid = (hi + lo) / 2, R0 = Math.abs(b.close - mid), width = hi - lo, edge = side > 0 ? hi : lo;
    if (!(R0 >= rule.minStopAtr * ctx.atrD[i])) continue;
    if (o.minScore && !(o.scoreNyOnly && rule.id === "asian-breakout") && (Math.abs(d!) < o.minScore || (!o.dailyOnly && Math.abs(f!) < o.minScore))) continue;
    if (o.maxStopAtr && R0 > o.maxStopAtr * ctx.atrD[i]) continue;
    if (o.maxExt && side * (b.close - edge) > o.maxExt * width) continue;
    const dl = o.delay ?? 0;
    if (i + 1 + dl >= m15.length) continue;
    const nx = m15[i + 1 + dl];
    if (side * (nx.open - mid) <= 0) continue; // already past the stop: the robot refuses
    if (o.slip !== undefined && (side * (nx.open + side * SPREAD - b.close)) / R0 > o.slip) continue;
    if (o.against && (side * (nx.open - edge) < 0 || side * (nx.open - b.close) < -0.25 * R0)) continue;
    const d0 = Date.parse(`${k}T00:00:00Z`), fri = new Date(d0).getUTCDay() === 5;
    const exitAt = (rule.exit === "same20" || fri ? d0 + 20 * H : d0 + 31 * H) + shift * H;
    let entry: number, j0: number, fillBar = -1;
    if (o.limit) {
      const L = b.close - side * o.limit.x * R0;
      let e = NaN;
      for (let j = i + 1; j <= i + 4 && j < m15.length && t[j] < exitAt; j++) {
        const c = m15[j];
        if (side > 0 ? c.low + SPREAD <= L : c.high - SPREAD >= L) { e = side > 0 ? Math.min(L, c.open + SPREAD) : Math.max(L, c.open - SPREAD); fillBar = j; break; }
      }
      if (fillBar < 0) continue;
      entry = e; j0 = fillBar;
    } else { entry = nx.open + side * SPREAD; j0 = i + 1 + dl; }
    const risk = side * (entry - mid);
    if (!(risk > 0.2)) continue;
    const target = o.limit?.keepTp ? b.close + side * rule.rr * R0 : entry + side * rule.rr * risk;
    const res = walk(ctx, j0, fillBar, side, entry, mid, target, risk, exitAt, o);
    if (res) out.push({ r: res.r, w: 1, at: t[i], entryT: t[j0], end: res.end, rule: rule.id, side });
  }
  return out;
}

/** Bar by bar: time exit at the open, then stop (first, conservative), partial, target; a moved stop applies from the next bar. */
function walk(ctx: Ctx, j0: number, fillBar: number, side: number, entry: number, stop0: number, target: number, risk: number, exitAt: number, o: Opts) {
  const { m15, t } = ctx;
  let stop = stop0, pending: number | null = null, beDone = false, pDone = false, size = 1, real = 0;
  const R = (px: number) => (side * (px - entry)) / risk;
  for (let j = j0; j < m15.length; j++) {
    const c = m15[j];
    if (pending !== null) { stop = pending; pending = null; }
    if (j !== fillBar) {
      if (t[j] >= exitAt) return { r: real + size * R(c.open), end: t[j] };
      if (o.newsProtect && newsSoon(ctx, t[j])) {
        const p = side * (c.open - entry);
        if (o.newsProtect === "close" && p > 0) return { r: real + size * R(c.open), end: t[j] };
        if (o.newsProtect === "be" && p > BUF && side * (entry + side * BUF - stop) > 0) stop = entry + side * BUF;
      }
    }
    if (side > 0 ? c.low <= stop : c.high >= stop) {
      const px = j === fillBar ? stop : side > 0 ? Math.min(stop, c.open) : Math.max(stop, c.open);
      return { r: real + size * R(px), end: t[j] + M15 };
    }
    if (j === fillBar) continue; // the fill bar counts only against us
    if (o.partial && !pDone && (side > 0 ? c.high >= entry + o.partial * risk : c.low <= entry - o.partial * risk)) { real += 0.5 * o.partial; size = 0.5; pDone = true; }
    if (side > 0 ? c.high >= target : c.low <= target) return { r: real + size * R(target), end: t[j] + M15 };
    if (o.be && !beDone && (side > 0 ? c.high >= entry + o.be * risk : c.low <= entry - o.be * risk)) { pending = entry + side * BUF; beDone = true; }
  }
  return null;
}

/** Portfolio exposure limits, in entry order: dir1 = one open per direction, tot2 = two open at most, half = second same-direction at half size. */
function exposure(ts: Trade[], mode?: "dir1" | "tot2" | "half"): Trade[] {
  if (!mode) return ts;
  const acc: Trade[] = [];
  for (const x of [...ts].sort((a, b) => a.entryT - b.entryT)) {
    const open = acc.filter((a) => a.end > x.entryT);
    if (mode === "dir1" && open.some((a) => a.side === x.side)) continue;
    if (mode === "tot2" && open.length >= 2) continue;
    acc.push(mode === "half" && open.some((a) => a.side === x.side) ? { ...x, w: 0.5 } : x);
  }
  return acc;
}

// ───────────────────────────── metrics ─────────────────────────────
type St = { n: number; pw: number; win: number; avg: number; pf: number; dd: number; sum: number };
function stats(ts: Trade[], weeks: number): St {
  let w = 0, g = 0, l = 0, s = 0, pk = 0, dd = 0, wsum = 0;
  for (const x of [...ts].sort((a, b) => a.at - b.at)) {
    const r = x.r * x.w; wsum += x.w;
    if (r > 0) { w++; g += r; } else l -= r;
    s += r; pk = Math.max(pk, s); dd = Math.max(dd, pk - s);
  }
  return { n: ts.length, pw: ts.length / weeks, win: ts.length ? (100 * w) / ts.length : 0, avg: wsum ? s / wsum : 0, pf: l > 0 ? g / l : Infinity, dd, sum: s };
}
/** $ account: risk pct of the closed balance at each entry, positions overlap; DD on the closed balance. */
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

type Row = { name: string; a: St; b: St; all: St; acc1: ReturnType<typeof account>; acc5: ReturnType<typeof account>; ts: Trade[] };
const fx = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "inf");
const sR = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(3);

function period(ctx: Ctx, name: string, ts: Trade[], from: number, cut: number, to: number): Row {
  const a = ts.filter((x) => x.at < cut), b = ts.filter((x) => x.at >= cut);
  return { name, a: stats(a, (cut - from) / WK), b: stats(b, (to - cut) / WK), all: stats(ts, (to - from) / WK), acc1: account(ts, 1), acc5: account(ts, 5), ts };
}
function run(ctx: Ctx, name: string, o: Opts = {}, exp?: "dir1" | "tot2" | "half", win?: { from: number; cut: number }): Row {
  const from = win?.from ?? ctx.t[0], to = ctx.t.at(-1)!, cut = win?.cut ?? CUT;
  let ts = rulesOf(o).flatMap((r) => trades(ctx, r, o)).filter((x) => x.at >= from);
  if (o.noDup) {
    const k = new Set(ts.filter((x) => x.rule === "ny-open-breakout").map((x) => `${x.entryT}:${x.side}`));
    ts = ts.filter((x) => x.rule !== "ny-late-breakout" || !k.has(`${x.entryT}:${x.side}`));
  }
  if (o.lateAlone) {
    const dk = (x: Trade) => new Date(x.at).toISOString().slice(0, 10);
    const opened = new Set(ts.filter((x) => x.rule === "ny-open-breakout").map(dk));
    ts = ts.filter((x) => x.rule !== "ny-late-breakout" || !opened.has(dk(x)));
  }
  ts = exposure(ts, exp);
  return period(ctx, name, ts, from, cut, to);
}

let BASE: Row;
function verdict(r: Row, ref: Row = BASE): string {
  if (r === ref) return "—";
  const avgBoth = r.a.avg > ref.a.avg && r.b.avg > ref.b.avg, pfBoth = r.a.pf > ref.a.pf && r.b.pf > ref.b.pf;
  const aBetter = r.a.avg > ref.a.avg || r.a.pf > ref.a.pf, bBetter = r.b.avg > ref.b.avg || r.b.pf > ref.b.pf;
  const freq = r.all.pw >= 1, ddOk = r.all.dd <= ref.all.dd * 1.15 + 0.5 && r.acc1.dd <= ref.acc1.dd * 1.15 + 0.5;
  if ((avgBoth || pfBoth) && freq && ddOk) return "REAL";
  if (avgBoth || pfBoth) return !freq ? "both↑ but <1/wk" : "both↑ but DD↑";
  if (aBetter && !bBetter) return "overfit (IS only)";
  if (bBetter && !aBetter) return "OOS only";
  return "worse";
}
function header(t: string, la = "19–22", lb = "23→") {
  console.log(`\n${t}`);
  console.log(`${"variant".padEnd(40)} | ${la.padEnd(6)} PF/avgR/n        | ${lb.padEnd(6)} PF/avgR/n        | all n  /wk win% PF   DD R  | $1500@1% ret/DD%   | @5% ret/DD%       | verdict`);
}
function line(r: Row, ref?: Row) {
  const p = (s: St) => `${fx(s.pf).padStart(5)} ${sR(s.avg)} ${String(s.n).padStart(4)}`;
  console.log(`${r.name.padEnd(40)} | ${p(r.a).padEnd(23)} | ${p(r.b).padEnd(23)} | ${String(r.all.n).padStart(4)} ${fx(r.all.pw).padStart(4)} ${r.all.win.toFixed(0).padStart(3)}% ${fx(r.all.pf).padStart(4)} ${r.all.dd.toFixed(1).padStart(5)} | ${fx(r.acc1.ret, 0).padStart(6)}% / ${r.acc1.dd.toFixed(1).padStart(4)}% | ${fx(r.acc5.ret, 0).padStart(7)}% / ${r.acc5.dd.toFixed(1).padStart(4)}% | ${verdict(r, ref)}`);
}
const show = (rows: Row[], ref?: Row) => rows.forEach((r) => line(r, ref));

// ───────────────────────────── main ─────────────────────────────
async function main() {
  const m15b = load("m15", "EU").filter((b) => b.time.getUTCFullYear() >= 2019), h4b = load("h4", "EU"), d1b = load("d1", "EU");
  const site = await loadBacktestData();
  const news = site.news.map((d) => d.getTime());
  const B = makeCtx(m15b, h4b, d1b, news);
  console.log(`broker ${new Date(B.t[0]).toISOString().slice(0, 10)} → ${new Date(B.t.at(-1)!).toISOString().slice(0, 10)} · HIGH news stored ${news.length}, from ${new Date(Math.min(...news)).toISOString().slice(0, 10)}`);

  BASE = run(B, "BASELINE (live rules, no news filter)");
  header("BASELINE — broker candles 2019→ (should match system-improve 'the system now': 274 tr +0.115R PF1.29 | 391 tr +0.169R PF1.45)");
  line(BASE);
  console.log("  per setup:");
  for (const id of SESSION_RULES.map((r) => r.id)) { const r = period(B, `  ${id}`, BASE.ts.filter((x) => x.rule === id), B.t[0], CUT, B.t.at(-1)!); line(r, r); }
  console.log(`  by year: ${[...new Set(BASE.ts.map((x) => new Date(x.at).getUTCFullYear()))].map((y) => { const s = stats(BASE.ts.filter((x) => new Date(x.at).getUTCFullYear() === y), 52); return `${y} ${sR(s.avg)}/PF${fx(s.pf)}/${s.n}`; }).join(" · ")}`);
  line(run(B, "baseline + robot slip 0.3R skip", { slip: 0.3 }));

  header("1. NY SESSIONS IN NEW YORK TIME (DST-aware) vs fixed UTC");
  show([run(B, "NY local time (08:30–09:30 / 09:30–10:30 ET)", { nyLocal: true })]);
  console.log("   NY rules only:");
  const nyIds = ["ny-open-breakout", "ny-late-breakout"];
  for (const id of nyIds) { const u = run(B, `   ${id} UTC`, { rules: [id] }), l = run(B, `   ${id} NY-local`, { rules: [id], nyLocal: true }); line(u); line(l, u); }

  header("2. TREND DEAD-ZONE");
  show([15, 25, 35, 45].flatMap((T) => [run(B, `|daily| & |4h| ≥ ${T}`, { minScore: T }), run(B, `|daily| ≥ ${T} only`, { minScore: T, dailyOnly: true })]));

  header("3. OVEREXTENSION CAP");
  show([
    ...[0.4, 0.5, 0.6, 0.75, 1].map((k) => run(B, `stop ≤ ${k} × daily ATR`, { maxStopAtr: k })),
    ...[0.25, 0.5].map((m) => run(B, `close ≤ edge + ${m} × range width`, { maxExt: m })),
    run(B, "stop ≤ 0.75 ATR & ext ≤ 0.5 width", { maxStopAtr: 0.75, maxExt: 0.5 }),
    run(B, "stop ≤ 1 ATR & ext ≤ 0.5 width", { maxStopAtr: 1, maxExt: 0.5 }),
  ]);

  header("4. CORRELATED EXPOSURE");
  show([
    run(B, "(a) max 1 open per direction", {}, "dir1"),
    run(B, "(b) max 2 open in total", {}, "tot2"),
    run(B, "(c) 2nd same-direction at half size", {}, "half"),
    run(B, "(d) drop ny-late", { rules: ["asian-breakout", "ny-open-breakout"] }),
  ]);
  {
    // Does ny-late add anything once ny-open has traded the same day?
    const dayOf = (x: Trade) => new Date(x.at).toISOString().slice(0, 10);
    const open = new Map(BASE.ts.filter((x) => x.rule === "ny-open-breakout").map((x) => [dayOf(x), x]));
    const late = BASE.ts.filter((x) => x.rule === "ny-late-breakout");
    const wks = (B.t.at(-1)! - B.t[0]) / WK;
    const grp = (name: string, ts: Trade[]) => { const a = stats(ts.filter((x) => x.at < CUT), 1), b = stats(ts.filter((x) => x.at >= CUT), 1), s = stats(ts, wks); console.log(`   ${name.padEnd(46)} 19–22 ${fx(a.pf)}/${sR(a.avg)}/${a.n}  23→ ${fx(b.pf)}/${sR(b.avg)}/${b.n}  all win ${s.win.toFixed(0)}% PF ${fx(s.pf)}`); };
    grp("ny-late, ny-open traded same day, same side", late.filter((x) => open.get(dayOf(x))?.side === x.side));
    grp("ny-late, ny-open traded same day, opposite", late.filter((x) => open.has(dayOf(x)) && open.get(dayOf(x))!.side !== x.side));
    grp("ny-late, no ny-open trade that day", late.filter((x) => !open.has(dayOf(x))));
    const both = late.filter((x) => open.get(dayOf(x))?.side === x.side);
    const pairOpen = both.map((x) => open.get(dayOf(x))!);
    grp("  …the ny-open trades on those same days", pairOpen);
    const corr = (() => { const a = pairOpen.map((x) => x.r), b = both.map((x) => x.r), ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length; let c = 0, va = 0, vb = 0; a.forEach((v, i) => { c += (v - ma) * (b[i] - mb); va += (v - ma) ** 2; vb += (b[i] - mb) ** 2; }); return c / Math.sqrt(va * vb); })();
    console.log(`   correlation of R, ny-open vs ny-late on shared same-side days: ${corr.toFixed(2)} (${both.length} days of ${late.length} ny-late trades)`);
    grp("ny-late only when ny-open did NOT trade", late.filter((x) => !open.has(dayOf(x))));
    line(period(B, "(e) ny-late only on days without ny-open", BASE.ts.filter((x) => x.rule !== "ny-late-breakout" || !open.has(dayOf(x))), B.t[0], CUT, B.t.at(-1)!));
  }

  header("5. PROFIT PROTECTION (stop checked first on a bar; a moved stop applies from the next bar)");
  show([
    run(B, "breakeven (+0.3) at +1R", { be: 1 }),
    run(B, "breakeven (+0.3) at +1.5R", { be: 1.5 }),
    run(B, "50% off at +1.5R, rest to target", { partial: 1.5 }),
    ...[2, 2.5].map((rr) => run(B, `asian rr ${rr}`, { rrAsian: rr })),
  ]);
  for (const rr of [2, 2.5, 3]) line(run(B, `   asian only, rr ${rr}`, { rules: ["asian-breakout"], rrAsian: rr }), run(B, "", { rules: ["asian-breakout"] }));

  header("6a. NY-LATE EXIT 20:00 UTC SAME DAY vs next 07:00");
  show([run(B, "ny-late flat at 20:00 UTC", { nyLateSame20: true })]);
  line(run(B, "   ny-late only, flat 20:00", { rules: ["ny-late-breakout"], nyLateSame20: true }), run(B, "", { rules: ["ny-late-breakout"] }));

  header("7. ENTRY FILTERS");
  show([
    run(B, "(a) robot slip: skip if > 0.3R past entry", { slip: 0.3 }),
    run(B, "(b) skip if next open inside range/-0.25R", { against: true }),
    run(B, "(c) limit 0.2R back, 4 bars", { limit: { x: 0.2 } }),
    run(B, "(c) limit 0.3R back, 4 bars", { limit: { x: 0.3 } }),
    run(B, "(c) limit 0.3R back, keep original TP", { limit: { x: 0.3, keepTp: true } }),
  ]);
  console.log("   (a) only binds when the entry is late: next-bar opens sit ≈ on the breakout close. Latency test:");
  for (const dl of [1, 2]) { const late = run(B, `   enter ${dl} bar(s) late, no slip rule`, { delay: dl }); line(late, late); line(run(B, `   enter ${dl} bar(s) late, slip ≤ 0.3R`, { delay: dl, slip: 0.3 }), late); }

  header("COMBINATIONS (vs baseline)");
  const combos: [string, Opts, ("dir1" | "tot2" | "half")?][] = [
    ["A ny-open NY-local", { nyLocalOpen: true }],
    ["B A + stop ≤ 0.5 ATR", { nyLocalOpen: true, maxStopAtr: 0.5 }],
    ["C B + 1 open per direction", { nyLocalOpen: true, maxStopAtr: 0.5 }, "dir1"],
    ["D B + 2nd same-dir half size", { nyLocalOpen: true, maxStopAtr: 0.5 }, "half"],
    ["E B + |daily| ≥ 35", { nyLocalOpen: true, maxStopAtr: 0.5, minScore: 35, dailyOnly: true }],
    ["F E + 1 open per direction", { nyLocalOpen: true, maxStopAtr: 0.5, minScore: 35, dailyOnly: true }, "dir1"],
    ["G A + 1 open per direction", { nyLocalOpen: true }, "dir1"],
    ["H A + half size 2nd same-dir", { nyLocalOpen: true }, "half"],
    ["I stop ≤ 0.5 ATR + 1 per direction", { maxStopAtr: 0.5 }, "dir1"],
    ["J A + |daily| ≥ 35", { nyLocalOpen: true, minScore: 35, dailyOnly: true }],
    ["K J + 2nd same-dir half size", { nyLocalOpen: true, minScore: 35, dailyOnly: true }, "half"],
    ["L J + ny-late only w/o ny-open", { nyLocalOpen: true, minScore: 35, dailyOnly: true, lateAlone: true }],
    ["M A + ny-late only w/o ny-open", { nyLocalOpen: true, lateAlone: true }],
    ["P A + |daily| ≥ 35 on NY rules only", { nyLocalOpen: true, minScore: 35, dailyOnly: true, scoreNyOnly: true }],
    ["Q A + |daily| ≥ 25 on NY rules only", { nyLocalOpen: true, minScore: 25, dailyOnly: true, scoreNyOnly: true }],
    ["R A + |daily| ≥ 45 on NY rules only", { nyLocalOpen: true, minScore: 45, dailyOnly: true, scoreNyOnly: true }],
    ["S P + 2nd same-dir half size", { nyLocalOpen: true, minScore: 35, dailyOnly: true, scoreNyOnly: true }, "half"],
    ["T P but ny-late skips a bar ny-open already took", { nyLocalOpen: true, minScore: 35, dailyOnly: true, scoreNyOnly: true, noDup: true }],
    ["U UTC sessions + |daily| ≥ 35 on NY rules", { minScore: 35, dailyOnly: true, scoreNyOnly: true }],
    ["V UTC + |daily| ≥ 25 on NY rules", { minScore: 25, dailyOnly: true, scoreNyOnly: true }],
    ["W UTC + |daily| ≥ 45 on NY rules", { minScore: 45, dailyOnly: true, scoreNyOnly: true }],
    ["N |daily| ≥ 35 alone, ny-late w/o ny-open", { minScore: 35, dailyOnly: true, lateAlone: true }],
  ];
  const cRows = combos.map(([n, o, e]) => run(B, n, o, e));
  show(cRows);
  for (const r of cRows) console.log(`   ${r.name.padEnd(36)} by year: ${[...new Set(r.ts.map((x) => new Date(x.at).getUTCFullYear()))].map((y) => { const s = stats(r.ts.filter((x) => new Date(x.at).getUTCFullYear() === y), 52); return `${y} ${sR(s.avg)}/${s.n}`; }).join(" · ")}`);
  const perSetup = (r: Row) => SESSION_RULES.map((x) => x.id).forEach((id) => { const q = period(B, `     ${id}`, r.ts.filter((x) => x.rule === id), B.t[0], CUT, B.t.at(-1)!); line(q, q); });
  for (const r of cRows.filter((r) => ["P", "T", "U"].includes(r.name[0]))) { console.log(`   per setup, ${r.name}:`); perSetup(r); }
  for (const r of cRows.filter((r) => ["A", "P"].includes(r.name[0]))) {
    // In winter the NY-local ny-open range (13:30–14:30 UTC) is the ny-late range: same breakout bar, doubled risk.
    const late = new Set(r.ts.filter((x) => x.rule === "ny-late-breakout").map((x) => `${x.entryT}:${x.side}`));
    const dup = r.ts.filter((x) => x.rule === "ny-open-breakout" && late.has(`${x.entryT}:${x.side}`));
    const s = stats(dup, 1);
    console.log(`   ${r.name}: ny-open trades entered on the SAME bar/side as ny-late: ${dup.length} of ${r.ts.filter((x) => x.rule === "ny-open-breakout").length} (their avg ${sR(s.avg)}R PF ${fx(s.pf)})`);
  }
  (globalThis as { COMBOS?: typeof combos }).COMBOS = combos;

  // ── news-dependent: only the stored-news window, broker candles and the site's own candles ──
  const nFrom = Math.min(...news);
  const S = makeCtx(site.m15, site.h4, site.d1, news);
  const sReady = S.t.findIndex((_, i) => S.daily[i] !== null && S.four[i] !== null);
  const sFrom = Math.max(S.t[sReady], nFrom);
  for (const [label, ctx, from] of [["BROKER candles", B, nFrom], ["SITE candles (DB)", S, sFrom]] as const) {
    const to = ctx.t.at(-1)!, cut = from + (to - from) / 2;
    const w = { from, cut };
    header(`NEWS-DEPENDENT on ${label}, ${new Date(from).toISOString().slice(0, 10)} → ${new Date(to).toISOString().slice(0, 10)} (halves split ${new Date(cut).toISOString().slice(0, 10)})`, "1st½", "2nd½");
    const ref = run(ctx, "no news filter", {}, undefined, w), live = run(ctx, "news skip (live rule)", { newsSkip: true }, undefined, w);
    line(ref, ref); line(live, ref);
    console.log("   vs news-skip (live) as reference:");
    show([
      run(ctx, "6b. +protect: BE 15 min before news", { newsSkip: true, newsProtect: "be" }, undefined, w),
      run(ctx, "6b. +protect: close 15 min before news", { newsSkip: true, newsProtect: "close" }, undefined, w),
      run(ctx, "6a. +ny-late flat 20:00", { newsSkip: true, nyLateSame20: true }, undefined, w),
      run(ctx, "7a. +robot slip 0.3R", { newsSkip: true, slip: 0.3 }, undefined, w),
      ...((globalThis as { COMBOS?: [string, Opts, ("dir1" | "tot2" | "half")?][] }).COMBOS ?? []).map(([n, o, e]) => run(ctx, `combo ${n} + news skip`, { ...o, newsSkip: true }, e, w)),
    ], live);
  }
  await closeDb();
}
main();
