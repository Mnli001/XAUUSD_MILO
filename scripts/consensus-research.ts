/**
 * Does the site's many-method reading point the right way? Replays it over the stored candles and
 * measures, with costs, what trading it would have done:  npx tsx --env-file=.env scripts/consensus-research.ts
 *
 * Nothing here is fitted to the data: the thresholds are swept and every result is printed, and the
 * last 30% of the history is reported apart from the first 70% so a lucky fit shows up as a gap.
 */
import { writeFileSync } from "node:fs";
import { loadCandles, SYMBOL } from "../src/lib/ingest/prices";
import { closeDb } from "../src/lib/db";
import { reason } from "../src/lib/analysis/reasoning";
import { atr, type Candle } from "../src/lib/analysis/indicators";
import { enT } from "../src/lib/i18n";
import { ubHour } from "../src/lib/time";

const COST = 0.3; // dollars per trade, round trip: spread plus a little slippage
const STEP = 1; // evaluate every 15-minute bar

type Row = { i: number; time: number; price: number; buy: number; sell: number; n: number; score: number; atrH1: number; hour: number };

/** Index of the last candle that had fully closed by `t` (candle time is its open). */
function upTo(c: Candle[], t: number, span: number, from: number): number {
  let k = from;
  while (k + 1 < c.length && c[k + 1].time.getTime() + span <= t) k++;
  return k;
}

async function main() {
  const [m15, h1, h4, d1] = await Promise.all([loadCandles(SYMBOL, "15min", 200000), loadCandles(SYMBOL, "1h", 100000), loadCandles(SYMBOL, "4h", 20000), loadCandles(SYMBOL, "1day", 5000)]);
  console.log(`candles: 15m ${m15.length}, 1h ${h1.length}, 4h ${h4.length}, 1d ${d1.length}; ${m15[0].time.toISOString().slice(0, 10)} → ${m15.at(-1)!.time.toISOString().slice(0, 10)}`);

  const rows: Row[] = [];
  let a = 0, b = 0, c = 0;
  const started = Date.now();
  for (let i = 400; i < m15.length - 1; i += STEP) {
    const bar = m15[i];
    const t = bar.time.getTime() + 15 * 60_000; // the moment this bar closed
    a = upTo(h1, t, 3_600_000, a); b = upTo(h4, t, 4 * 3_600_000, b); c = upTo(d1, t, 86_400_000, c);
    if (a < 300 || b < 120 || c < 60) continue;
    const input = { m15: m15.slice(i - 299, i + 1), h1: h1.slice(a - 299, a + 1), h4: h4.slice(Math.max(0, b - 299), b + 1), d1: d1.slice(Math.max(0, c - 59), c + 1), price: bar.close, now: new Date(t) };
    const r = reason(input, enT);
    const h1Atr = atr(input.h1);
    rows.push({ i, time: t, price: bar.close, buy: r.buy, sell: r.sell, n: r.buy + r.sell + r.neutral, score: r.score, atrH1: h1Atr, hour: ubHour(new Date(t)) });
    if (rows.length % 10000 === 0) console.log(`  ${rows.length} readings, ${Math.round((Date.now() - started) / 1000)}s`);
  }
  console.log(`readings: ${rows.length} in ${Math.round((Date.now() - started) / 1000)}s; methods counted: ${rows[0]?.n}`);

  // ---- 1. Does the reading forecast direction? Forward move after the reading, by how many methods lean. ----
  const horizons = [[4, "1h"], [16, "4h"], [96, "24h"]] as const;
  console.log("\nFORECAST: share of times price was higher after the horizon, by net lean (buy − sell)");
  console.log("lean bucket      n      " + horizons.map(([, l]) => `up% ${l}  avg$ ${l}`).join("   "));
  const buckets: [string, (r: Row) => boolean][] = [
    ["sell ≥ 8 net", (r) => r.sell - r.buy >= 8], ["sell 4–7 net", (r) => r.sell - r.buy >= 4 && r.sell - r.buy < 8], ["−3…+3", (r) => Math.abs(r.buy - r.sell) <= 3],
    ["buy 4–7 net", (r) => r.buy - r.sell >= 4 && r.buy - r.sell < 8], ["buy ≥ 8 net", (r) => r.buy - r.sell >= 8],
  ];
  for (const [name, test] of buckets) {
    const sel = rows.filter(test);
    const cells = horizons.map(([h]) => {
      let up = 0, sum = 0, n = 0;
      for (const r of sel) { const f = m15[r.i + h]; if (!f) continue; const d = f.close - r.price; if (d > 0) up++; sum += d; n++; }
      return n ? `${((up / n) * 100).toFixed(1).padStart(5)}%  ${(sum / n).toFixed(2).padStart(6)}` : "    –       –";
    });
    console.log(`${name.padEnd(14)} ${String(sel.length).padStart(6)}   ${cells.join("     ")}`);
  }
  const base = horizons.map(([h]) => { let up = 0, n = 0; for (const r of rows) { const f = m15[r.i + h]; if (!f) continue; if (f.close > r.price) up++; n++; } return `${((up / n) * 100).toFixed(1)}%`; });
  console.log(`all readings (the base rate, gold rose over the period): ${base.join(" / ")}`);

  // ---- 2. Trading it: enter with the lean, stop k×ATR(1h), target RR×stop, one trade at a time, costs paid. ----
  type Res = { trades: number; wins: number; r: number; pf: number; dd: number };
  const simulate = (sel: Row[], minSide: number, stopAtr: number, rr: number, hours: (h: number) => boolean, contrarian = false, only = 0): Res => {
    let busyUntil = -1, trades = 0, wins = 0, sumR = 0, gain = 0, loss = 0, peak = 0, dd = 0;
    for (const r of sel) {
      if (r.i <= busyUntil || !hours(r.hour) || !Number.isFinite(r.atrH1) || r.atrH1 <= 0) continue;
      let dir = r.buy >= minSide && r.buy > r.sell ? 1 : r.sell >= minSide && r.sell > r.buy ? -1 : 0;
      if (!dir || (only && dir !== only)) continue;
      if (contrarian) dir = -dir;
      const risk = stopAtr * r.atrH1, stop = r.price - dir * risk, target = r.price + dir * risk * rr;
      let out = 0, j = r.i + 1;
      for (; j < m15.length && j <= r.i + 96 * 5; j++) { // give a trade five days at most
        const k = m15[j];
        const hitStop = dir > 0 ? k.low <= stop : k.high >= stop, hitTarget = dir > 0 ? k.high >= target : k.low <= target;
        if (hitStop) { out = -1; break; } // a bar touching both counts as the stop
        if (hitTarget) { out = rr; break; }
      }
      if (out === 0) out = (dir * (m15[Math.min(j, m15.length - 1)].close - r.price)) / risk; // timed out: close at market
      const net = out - COST / risk;
      trades++; if (net > 0) { wins++; gain += net; } else loss -= net;
      sumR += net; peak = Math.max(peak, sumR); dd = Math.max(dd, peak - sumR);
      busyUntil = j;
    }
    return { trades, wins, r: sumR, pf: loss > 0 ? gain / loss : gain > 0 ? Infinity : 0, dd };
  };
  const cut = rows[Math.floor(rows.length * 0.7)].time;
  const early = rows.filter((r) => r.time < cut), late = rows.filter((r) => r.time >= cut);
  const fmt = (x: Res) => `${String(x.trades).padStart(4)} tr  ${(x.trades ? (x.wins / x.trades) * 100 : 0).toFixed(0).padStart(3)}% win  ${x.r >= 0 ? "+" : ""}${x.r.toFixed(1).padStart(6)}R  PF ${Number.isFinite(x.pf) ? x.pf.toFixed(2) : "∞"}  DD ${x.dd.toFixed(1)}R`;
  const all = () => true, session = (h: number) => h >= 15 || h < 1;
  console.log(`\nTRADING IT (cost $${COST} a trade). First 70% of history | last 30% (from ${new Date(cut).toISOString().slice(0, 10)})`);
  const out: Record<string, unknown>[] = [];
  for (const [label, hours] of [["all hours", all], ["15:00–01:00 UB", session]] as const) {
    for (const contrarian of [false, true]) {
      console.log(`\n${label}${contrarian ? ", AGAINST the reading" : ", with the reading"}`);
      for (const minSide of [7, 8, 9, 10, 11, 12]) for (const [stopAtr, rr] of [[1.5, 2], [1, 1.5], [2, 1]] as const) {
        const e = simulate(early, minSide, stopAtr, rr, hours, contrarian), l = simulate(late, minSide, stopAtr, rr, hours, contrarian);
        console.log(`  ≥${String(minSide).padStart(2)} methods, stop ${stopAtr}×ATR, RR ${rr}:  ${fmt(e)}  |  ${fmt(l)}`);
        out.push({ label, contrarian, minSide, stopAtr, rr, early: e, late: l });
      }
    }
  }
  console.log("\nBY SIDE (all hours, with the reading, stop 1.5×ATR, RR 2): is it more than a rising market?");
  for (const minSide of [8, 9, 10]) for (const [name, only] of [["BUY only ", 1], ["SELL only", -1]] as const) {
    console.log(`  ≥${String(minSide).padStart(2)} methods, ${name}:  ${fmt(simulate(early, minSide, 1.5, 2, all, false, only))}  |  ${fmt(simulate(late, minSide, 1.5, 2, all, false, only))}`);
  }
  console.log("\nBY YEAR (≥9 methods, stop 1.5×ATR, RR 2, all hours)");
  for (const y of [...new Set(rows.map((r) => new Date(r.time).getUTCFullYear()))]) console.log(`  ${y}:  ${fmt(simulate(rows.filter((r) => new Date(r.time).getUTCFullYear() === y), 9, 1.5, 2, all))}`);
  console.log("\nCOST SENSITIVITY is in COST at the top; this run used $" + COST);
  writeFileSync("consensus-research.json", JSON.stringify({ rows: rows.length, cut: new Date(cut).toISOString(), results: out }, null, 1));
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
