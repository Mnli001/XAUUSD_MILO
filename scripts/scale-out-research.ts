/**
 * Does taking part of the Asian trade off at TP1 (and moving the stop to the entry) give a higher win rate
 * without giving up the result? Replayed on the broker's history 2019 → with the live rule's orders.
 * Chosen on 2019–2022, judged untouched on 2023 →.   npx tsx --env-file=.env scripts/scale-out-research.ts
 */
import { load } from "./broker-data";
import { asianRangeOrders, ASIAN_MIN_STOP_ATR } from "../src/lib/bot/ideas";
import { alignClosed, type Order } from "../src/lib/bot/backtest";
import { atrSeries } from "../src/lib/analysis/indicators";
import { DEFAULT_PARAMS, scoreSeries } from "../src/lib/bot/strategy";
import type { Candle } from "../src/lib/analysis/indicators";

const SPREAD = 0.3;
type Plan = { tp1: number | null; part: number; tp2: number; be: boolean };
type Res = { r: number; at: Date };

/** One trade: entry at the next bar's open, stop first inside a bar, TP1 takes `part`, the rest runs to TP2, stop, or the time exit. */
function play(m15: Candle[], i: number, o: Order, p: Plan): Res | null {
  const b0 = m15[i + 1];
  if (!b0) return null;
  const dir = o.side === "BUY" ? 1 : -1, entry = b0.open + dir * SPREAD, d = o.stopDist;
  let stop = entry - dir * d, left = 1, got = 0, tp1Done = p.tp1 === null;
  const end = Math.min(m15.length - 1, i + 1 + (o.maxBars ?? 96));
  for (let j = i + 1; j <= end; j++) {
    const b = m15[j];
    if (j - (i + 1) >= (o.maxBars ?? 96)) { got += left * (dir * (b.open - entry)) / d; return { r: got, at: b0.time }; }
    if (dir > 0 ? b.low <= stop : b.high >= stop) { got += left * (dir * (stop - entry)) / d; return { r: got, at: b0.time }; }
    if (!tp1Done && (dir > 0 ? b.high >= entry + dir * p.tp1! * d : b.low <= entry + dir * p.tp1! * d)) {
      got += p.part * p.tp1!; left -= p.part; tp1Done = true;
      if (p.be) stop = entry;
      if (left <= 1e-9) return { r: got, at: b0.time };
    }
    if (dir > 0 ? b.high >= entry + p.tp2 * d : b.low <= entry - p.tp2 * d) { got += left * p.tp2; return { r: got, at: b0.time }; }
  }
  got += left * (dir * (m15[end].close - entry)) / d;
  return { r: got, at: b0.time };
}

const stats = (rs: Res[]) => {
  let w = 0, g = 0, l = 0, s = 0, peak = 0, dd = 0;
  for (const { r } of rs) { if (r > 0.001) { w++; g += r; } else if (r < -0.001) l -= r; s += r; peak = Math.max(peak, s); dd = Math.max(dd, peak - s); }
  const avgWin = w ? g / w : 0, losses = rs.filter((x) => x.r < -0.001).length, avgLoss = losses ? l / losses : 0;
  return { n: rs.length, win: rs.length ? (100 * w) / rs.length : 0, avg: rs.length ? s / rs.length : 0, pf: l > 0 ? g / l : Infinity, dd, rr: avgLoss ? avgWin / avgLoss : 0 };
};
const f = (x: ReturnType<typeof stats>) => `${String(x.n).padStart(4)} tr  win ${x.win.toFixed(0).padStart(3)}%  RR 1:${x.rr.toFixed(2)}  avg ${(x.avg >= 0 ? "+" : "") + x.avg.toFixed(3)}R  PF ${x.pf.toFixed(2)}  DD ${x.dd.toFixed(1)}R`;

const m15 = load("m15", "EU").filter((b) => b.time.getUTCFullYear() >= 2019), h4 = load("h4", "EU"), d1 = load("d1", "EU");
const dec = m15.map((c) => c.time.getTime() + 15 * 6e4);
const daily = alignClosed(dec, d1, scoreSeries(d1), "1day"), four = alignClosed(dec, h4, scoreSeries(h4), "4h");
const atrD = alignClosed(dec, d1, atrSeries(d1), "1day").map((x) => x ?? NaN);
const params = { ...DEFAULT_PARAMS, breakeven: false, maxTradesPerDay: 2 };
const orders = asianRangeOrders(m15, { rr: 3, news: [], params, trend: daily, confirm: four, minStop: { atr: atrD, k: ASIAN_MIN_STOP_ATR } });
const CUT = Date.UTC(2023, 0, 1);

const plans: [string, Plan][] = [["the rule: all at 3R", { tp1: null, part: 0, tp2: 3, be: false }]];
for (const tp1 of [0.75, 1, 1.5]) for (const part of [0.3, 0.5, 0.7]) for (const be of [true, false]) plans.push([`TP1 ${tp1}R × ${part * 100}%${be ? " + BE" : ""}, rest 3R`, { tp1, part, tp2: 3, be }]);
plans.push(["all at 1R", { tp1: null, part: 0, tp2: 1, be: false }], ["all at 1.5R", { tp1: null, part: 0, tp2: 1.5, be: false }], ["all at 2R", { tp1: null, part: 0, tp2: 2, be: false }]);

console.log(`broker history ${m15[0].time.toISOString().slice(0, 10)} → ${m15.at(-1)!.time.toISOString().slice(0, 10)}, ${orders.filter(Boolean).length} trades\n`);
for (const [name, p] of plans) {
  const res = orders.flatMap((o, i) => (o ? [play(m15, i, o, p)].filter((x): x is Res => !!x) : []));
  const a = stats(res.filter((x) => x.at.getTime() < CUT)), b = stats(res.filter((x) => x.at.getTime() >= CUT));
  console.log(`${name.padEnd(30)} 2019–22: ${f(a)}\n${"".padEnd(30)} 2023→:   ${f(b)}`);
}
