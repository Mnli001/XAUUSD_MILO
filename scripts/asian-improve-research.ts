/**
 * Ways to raise the Asian rule's reward-to-risk and win rate, on the broker's history 2019 →:
 * a limit entry on the retest of the range edge, other stops, other exits, the entry hour, breakeven.
 * Chosen on 2019–2022, judged untouched on 2023 →.   npx tsx scripts/asian-improve-research.ts
 */
import { load } from "./broker-data";
import { asianRangeOrders, ASIAN_MIN_STOP_ATR } from "../src/lib/bot/ideas";
import { alignClosed, type Order } from "../src/lib/bot/backtest";
import { atrSeries } from "../src/lib/analysis/indicators";
import { DEFAULT_PARAMS, scoreSeries } from "../src/lib/bot/strategy";

const M15 = 15 * 6e4, SPREAD = 0.3;
const m15 = load("m15", "EU").filter((b) => b.time.getUTCFullYear() >= 2019), h4 = load("h4", "EU"), d1 = load("d1", "EU");
const dec = m15.map((c) => c.time.getTime() + M15);
const daily = alignClosed(dec, d1, scoreSeries(d1), "1day"), four = alignClosed(dec, h4, scoreSeries(h4), "4h");
const atrD = alignClosed(dec, d1, atrSeries(d1), "1day").map((x) => x ?? NaN);
const params = { ...DEFAULT_PARAMS, breakeven: false, maxTradesPerDay: 2 };
const orders = asianRangeOrders(m15, { rr: 3, news: [], params, trend: daily, confirm: four, minStop: { atr: atrD, k: ASIAN_MIN_STOP_ATR } });

/** The Asian range of the day of bar i. */
const rangeOf = new Map<string, { hi: number; lo: number }>();
for (const b of m15) { if (b.time.getUTCHours() >= 7) continue; const k = b.time.toISOString().slice(0, 10); const r = rangeOf.get(k) ?? { hi: -Infinity, lo: Infinity }; r.hi = Math.max(r.hi, b.high); r.lo = Math.min(r.lo, b.low); rangeOf.set(k, r); }

type V = {
  entry: "close" | "retest"; // retest: a limit at the range edge, valid until 16:00 UTC
  stop: "mid" | "edge25" | "edge40"; // middle of the range, or 25% / 40% of the range inside the edge
  target: "3R" | "2R" | "4R" | "samePrice"; // samePrice: the price the close entry would have aimed at
  exit: "20utc" | "next07" | "none48h";
  be: number | null; // move the stop to the entry at this many R
  hours: [number, number]; // breakout bar hour window, UTC
};
type Res = { r: number; at: Date };

function trade(i: number, o: Order, v: V): Res | null {
  const bar = m15[i], h = bar.time.getUTCHours();
  if (h < v.hours[0] || h >= v.hours[1]) return null;
  const dir = o.side === "BUY" ? 1 : -1, key = bar.time.toISOString().slice(0, 10), rg = rangeOf.get(key)!;
  const width = rg.hi - rg.lo, mid = (rg.hi + rg.lo) / 2, edge = dir > 0 ? rg.hi : rg.lo;
  const stopPx = v.stop === "mid" ? mid : edge - dir * (v.stop === "edge25" ? 0.25 : 0.4) * width;
  const closeTarget = bar.close + dir * 3 * Math.abs(bar.close - mid);
  const dayEnd = Date.UTC(bar.time.getUTCFullYear(), bar.time.getUTCMonth(), bar.time.getUTCDate(), 20);
  const exitAt = v.exit === "20utc" ? dayEnd : v.exit === "next07" ? dayEnd + 11 * 36e5 : bar.time.getTime() + 48 * 36e5;
  let j = i + 1, entry: number;
  if (v.entry === "close") {
    if (!m15[j]) return null;
    entry = m15[j].open + dir * SPREAD;
  } else {
    // wait for price to come back to the edge before 16:00 UTC
    const limit = edge + dir * SPREAD;
    const cutoff = Date.UTC(bar.time.getUTCFullYear(), bar.time.getUTCMonth(), bar.time.getUTCDate(), 16);
    for (; j < m15.length && m15[j].time.getTime() < cutoff; j++) if (dir > 0 ? m15[j].low <= edge : m15[j].high >= edge) break;
    if (j >= m15.length || m15[j].time.getTime() >= cutoff) return { r: 0, at: bar.time }; // never filled: no trade (counted as 0, excluded below)
    entry = limit;
  }
  const risk = dir * (entry - stopPx);
  if (!(risk > 0.2)) return null;
  const target = v.target === "samePrice" ? closeTarget : entry + dir * Number(v.target[0]) * risk;
  if (dir * (target - entry) <= 0) return null;
  let stop = stopPx;
  for (let k = j; k < m15.length; k++) {
    const b = m15[k];
    if (b.time.getTime() >= exitAt) return { r: (dir * (b.open - entry)) / risk, at: bar.time };
    if (dir > 0 ? b.low <= stop : b.high >= stop) return { r: (dir * (stop - entry)) / risk, at: bar.time };
    if (dir > 0 ? b.high >= target : b.low <= target) return { r: (dir * (target - entry)) / risk, at: bar.time };
    if (v.be !== null && stop !== entry && (dir > 0 ? b.high >= entry + v.be * risk : b.low <= entry - v.be * risk)) stop = entry;
  }
  return null;
}

const stats = (rs: Res[]) => {
  let w = 0, g = 0, l = 0, s = 0, peak = 0, dd = 0, nl = 0;
  for (const { r } of rs) { if (r > 0.001) { w++; g += r; } else { l -= Math.min(r, 0); if (r < -0.001) nl++; } s += r; peak = Math.max(peak, s); dd = Math.max(dd, peak - s); }
  return { n: rs.length, win: rs.length ? (100 * w) / rs.length : 0, avg: rs.length ? s / rs.length : 0, pf: l > 0 ? g / l : Infinity, dd, rr: w && nl ? g / w / (l / nl) : 0, sum: s };
};
const f = (x: ReturnType<typeof stats>) => `${String(x.n).padStart(3)} tr ${x.win.toFixed(0).padStart(3)}% RR 1:${x.rr.toFixed(2)} avg ${(x.avg >= 0 ? "+" : "") + x.avg.toFixed(3)}R PF ${x.pf.toFixed(2)} DD ${x.dd.toFixed(1)}R`;
const CUT = Date.UTC(2023, 0, 1);
const BASE: V = { entry: "close", stop: "mid", target: "3R", exit: "20utc", be: null, hours: [7, 16] };
const rows: { name: string; a: ReturnType<typeof stats>; b: ReturnType<typeof stats>; all: ReturnType<typeof stats> }[] = [];
function run(name: string, v: V) {
  const res = orders.flatMap((o, i) => (o ? [trade(i, o, v)] : [])).filter((x): x is Res => !!x && !(v.entry === "retest" && x.r === 0));
  const a = stats(res.filter((x) => x.at.getTime() < CUT)), b = stats(res.filter((x) => x.at.getTime() >= CUT));
  rows.push({ name, a, b, all: stats(res) });
  console.log(`${name.padEnd(36)} 2019–22: ${f(a)}  |  2023→: ${f(b)}`);
}

console.log(`broker ${m15[0].time.toISOString().slice(0, 10)} → ${m15.at(-1)!.time.toISOString().slice(0, 10)}\n`);
run("the rule (close entry, mid stop, 3R)", BASE);
console.log("\nENTRY");
run("retest of the edge, 3R", { ...BASE, entry: "retest" });
run("retest, same target price", { ...BASE, entry: "retest", target: "samePrice" });
run("retest, 4R", { ...BASE, entry: "retest", target: "4R" });
console.log("\nSTOP");
run("stop 25% inside the edge, 3R", { ...BASE, stop: "edge25" });
run("stop 40% inside the edge, 3R", { ...BASE, stop: "edge40" });
run("stop 25%, same target price", { ...BASE, stop: "edge25", target: "samePrice" });
console.log("\nEXIT");
run("hold to 07:00 UTC next day", { ...BASE, exit: "next07" });
run("hold up to 48 h", { ...BASE, exit: "none48h" });
run("breakeven at 1.5R", { ...BASE, be: 1.5 });
run("breakeven at 2R", { ...BASE, be: 2 });
console.log("\nHOUR OF THE BREAKOUT");
run("07–12 UTC only", { ...BASE, hours: [7, 12] });
run("12–16 UTC only", { ...BASE, hours: [12, 16] });
run("07–11 UTC only", { ...BASE, hours: [7, 11] });
run("07–13 UTC only", { ...BASE, hours: [7, 13] });
console.log("\nCOMBINED");
run("07–12 + hold to 07:00 next day", { ...BASE, hours: [7, 12], exit: "next07" });
run("07–12 + 4R", { ...BASE, hours: [7, 12], target: "4R" });
run("07–12 + 2R", { ...BASE, hours: [7, 12], target: "2R" });
console.log("\nHELD UP (better avg R than the rule in BOTH periods, ≥ 60 trades each):");
const ref = rows[0];
for (const r of rows.slice(1)) if (r.a.n >= 60 && r.b.n >= 60 && r.a.avg > ref.a.avg && r.b.avg > ref.b.avg) console.log(`  ${r.name}: all ${f(r.all)}`);
