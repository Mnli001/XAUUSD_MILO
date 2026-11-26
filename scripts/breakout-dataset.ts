/**
 * Every session-range breakout on the broker's history (both directions, no trend or width filter), each with
 * what was known at that close and how a trade at the rule's stop and target ended. Fed to a probability model
 * (scripts/breakout-model.py).   npx tsx scripts/breakout-dataset.ts > breakouts.csv
 */
import { load } from "./broker-data";
import { alignClosed } from "../src/lib/bot/backtest";
import { atrSeries, ema, rsi, type Candle } from "../src/lib/analysis/indicators";
import { scoreSeries } from "../src/lib/bot/strategy";
import { SESSION_RULES } from "../src/lib/setup/sessionRules";

async function main() {
const M15 = 15 * 6e4, H = 36e5, SPREAD = 0.3;
// `--site` reads the site's own stored candles instead of the broker export.
const SITE = process.argv.includes("--site");
const src = SITE ? await (async () => { const { loadBacktestData } = await import("../src/lib/bot/run"); const d = await loadBacktestData(); const { closeDb } = await import("../src/lib/db"); await closeDb(); return d; })() : null;
const m15 = src ? src.m15 : load("m15", "EU").filter((b) => b.time.getUTCFullYear() >= 2019), h4 = src ? src.h4 : load("h4", "EU"), d1 = src ? src.d1 : load("d1", "EU");
const dec = m15.map((c) => c.time.getTime() + M15);
const daily = alignClosed(dec, d1, scoreSeries(d1), "1day"), four = alignClosed(dec, h4, scoreSeries(h4), "4h");
const atrD = alignClosed(dec, d1, atrSeries(d1), "1day").map((x) => x ?? NaN);
const e50d = alignClosed(dec, d1, ema(d1.map((c) => c.close), 50), "1day").map((x) => x ?? NaN);
const dClose = alignClosed(dec, d1, d1.map((c) => c.close), "1day"), dOpen = alignClosed(dec, d1, d1.map((c) => c.open), "1day");
const dHigh = alignClosed(dec, d1, d1.map((c) => c.high), "1day"), dLow = alignClosed(dec, d1, d1.map((c) => c.low), "1day");
const atr15 = atrSeries(m15), rsi15 = rsi(m15.map((c) => c.close));
const s15 = scoreSeries(m15 as Candle[]);

const cols = ["time", "session", "side", "r", "win", "dScore", "h4Score", "m15Score", "stopAtr", "widthAtr", "bodyAtr", "closeLoc", "hour", "dow", "ema50Dist", "prevDayDir", "rsi", "beyondPrevDay", "atr15Rel", "oppBroken", "barsSinceRange"];
console.log(cols.join(","));
for (const [si, rule] of SESSION_RULES.entries()) {
  let day = "", hi = -Infinity, lo = Infinity, n = 0, taken = 0, brokeUp = false, brokeDn = false;
  for (let i = 300; i < m15.length - 1; i++) {
    const b = m15[i], k = b.time.toISOString().slice(0, 10), h = b.time.getUTCHours() + b.time.getUTCMinutes() / 60;
    if (k !== day) { day = k; hi = -Infinity; lo = Infinity; n = 0; taken = 0; brokeUp = false; brokeDn = false; }
    if (h >= rule.rangeFrom && h < rule.rangeTo) { hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); n++; continue; }
    if (h < rule.rangeTo || h >= rule.entryTo || n < rule.minBars) continue;
    const side = b.close > hi ? 1 : b.close < lo ? -1 : 0;
    if (!side) continue;
    // the first close out each side counts once a day
    if (side > 0 ? brokeUp : brokeDn) continue;
    const opp = side > 0 ? brokeDn : brokeUp;
    if (side > 0) brokeUp = true; else brokeDn = true;
    if (taken >= 2 || !Number.isFinite(atrD[i]) || daily[i] === null || four[i] === null || s15[i] === null) continue;
    taken++;
    const mid = (hi + lo) / 2;
    const entry = m15[i + 1].open + side * SPREAD, risk = side * (entry - mid);
    if (!(risk > 0.2)) continue;
    const target = entry + side * rule.rr * risk;
    const d0 = Date.parse(`${k}T00:00:00Z`), fri = new Date(d0).getUTCDay() === 5;
    const exitAt = rule.exit === "same20" || fri ? d0 + 20 * H : d0 + 31 * H;
    let r: number | null = null;
    for (let j = i + 1; j < m15.length; j++) {
      const c = m15[j];
      if (c.time.getTime() >= exitAt) { r = (side * (c.open - entry)) / risk; break; }
      if (side > 0 ? c.low <= mid : c.high >= mid) { r = -1; break; }
      if (side > 0 ? c.high >= target : c.low <= target) { r = rule.rr; break; }
    }
    if (r === null) continue;
    const a = atrD[i];
    const row = [
      b.time.toISOString(), si, side, r.toFixed(3), r > 0 ? 1 : 0,
      (side * daily[i]!).toFixed(1), (side * four[i]!).toFixed(1), (side * s15[i]!).toFixed(1),
      (Math.abs(b.close - mid) / a).toFixed(3), ((hi - lo) / a).toFixed(3),
      (Math.abs(b.close - b.open) / atr15[i]).toFixed(3), (side > 0 ? (b.close - b.low) / (b.high - b.low || 1) : (b.high - b.close) / (b.high - b.low || 1)).toFixed(3),
      h.toFixed(2), b.time.getUTCDay(),
      ((side * (b.close - e50d[i])) / a).toFixed(3),
      (side * Math.sign((dClose[i] ?? 0) - (dOpen[i] ?? 0))).toFixed(0),
      (side > 0 ? rsi15[i] : 100 - rsi15[i]).toFixed(1),
      (side > 0 ? (b.close > (dHigh[i] ?? Infinity) ? 1 : 0) : (b.close < (dLow[i] ?? -Infinity) ? 1 : 0)),
      (atr15[i] / a).toFixed(4), opp ? 1 : 0, Math.round((h - rule.rangeTo) * 4),
    ];
    console.log(row.join(","));
  }
}
}
main().catch((e) => { console.error(e); process.exit(1); });
