/**
 * Does the day-trade pattern (sweep → shift → return to FVG/OB → reaction) hold up on the stored
 * candles, and does asking the other methods first help?   npx tsx --env-file=.env scripts/smc-research.ts
 * Every variant is printed; the last 30% of the history is reported apart from the first 70%.
 */
import { loadCandles, SYMBOL } from "../src/lib/ingest/prices";
import { closeDb } from "../src/lib/db";
import { reason } from "../src/lib/analysis/reasoning";
import { ema, type Candle } from "../src/lib/analysis/indicators";
import { findSmcSetups, type SmcOptions, type SmcSetup } from "../src/lib/analysis/smc";
import { enT } from "../src/lib/i18n";
import { ubHour } from "../src/lib/time";

const COST = 0.3; // dollars per trade, round trip

type Res = { trades: number; wins: number; r: number; pf: number; dd: number };
type Tagged = SmcSetup & { time: number; hour: number; trend: number; lean: number; total: number };

/** Index of the last candle fully closed by t. */
const lastClosed = (c: Candle[], t: number, span: number) => {
  let lo = 0, hi = c.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (c[mid].time.getTime() + span <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
};

async function main() {
  const [m15, h1, h4, d1] = await Promise.all([loadCandles(SYMBOL, "15min", 200000), loadCandles(SYMBOL, "1h", 100000), loadCandles(SYMBOL, "4h", 20000), loadCandles(SYMBOL, "1day", 5000)]);
  console.log(`15m candles ${m15.length}: ${m15[0].time.toISOString().slice(0, 10)} → ${m15.at(-1)!.time.toISOString().slice(0, 10)}`);
  const h1Close = h1.map((c) => c.close), e50 = ema(h1Close, 50), e200 = ema(h1Close, 200);
  const readingCache = new Map<number, { buy: number; sell: number; total: number }>();
  const readingAt = (i: number) => {
    const hit = readingCache.get(i);
    if (hit) return hit;
    const t = m15[i].time.getTime() + 15 * 60_000;
    const a = lastClosed(h1, t, 3_600_000), b = lastClosed(h4, t, 4 * 3_600_000), c = lastClosed(d1, t, 86_400_000);
    let v = { buy: 0, sell: 0, total: 0 };
    if (i >= 300 && a >= 300 && b >= 120 && c >= 60) {
      const r = reason({ m15: m15.slice(i - 299, i + 1), h1: h1.slice(a - 299, a + 1), h4: h4.slice(Math.max(0, b - 299), b + 1), d1: d1.slice(Math.max(0, c - 59), c + 1), price: m15[i].close, now: new Date(t) }, enT);
      v = { buy: r.buy, sell: r.sell, total: r.buy + r.sell + r.neutral };
    }
    readingCache.set(i, v);
    return v;
  };
  const tag = (s: SmcSetup): Tagged => {
    const t = m15[s.at].time.getTime() + 15 * 60_000;
    const a = lastClosed(h1, t, 3_600_000);
    const trend = a >= 200 && Number.isFinite(e200[a]) ? (e50[a] > e200[a] && h1Close[a] > e50[a] ? 1 : e50[a] < e200[a] && h1Close[a] < e50[a] ? -1 : 0) : 0;
    const r = readingAt(s.at), dir = s.side === "BUY" ? 1 : -1;
    return { ...s, time: t, hour: ubHour(new Date(t)), trend: trend * dir, lean: (r.buy - r.sell) * dir, total: r.total };
  };

  const simulate = (sel: Tagged[]): Res => {
    let busy = -1, trades = 0, wins = 0, sum = 0, gain = 0, loss = 0, peak = 0, dd = 0;
    for (const s of sel) {
      if (s.at <= busy) continue;
      const dir = s.side === "BUY" ? 1 : -1, rr = Math.abs(s.target - s.entry) / s.risk;
      let out = 0, j = s.at + 1;
      for (; j < m15.length && j <= s.at + 96; j++) { // a day trade: one day at most
        const k = m15[j];
        if (dir > 0 ? k.low <= s.stop : k.high >= s.stop) { out = -1; break; } // a bar touching both counts as the stop
        if (dir > 0 ? k.high >= s.target : k.low <= s.target) { out = rr; break; }
      }
      if (out === 0) out = (dir * (m15[Math.min(j, m15.length - 1)].close - s.entry)) / s.risk;
      const net = out - COST / s.risk;
      trades++; if (net > 0) { wins++; gain += net; } else loss -= net;
      sum += net; peak = Math.max(peak, sum); dd = Math.max(dd, peak - sum);
      busy = j;
    }
    return { trades, wins, r: sum, pf: loss > 0 ? gain / loss : gain > 0 ? Infinity : 0, dd };
  };
  const fmt = (x: Res) => `${String(x.trades).padStart(4)} tr ${(x.trades ? (x.wins / x.trades) * 100 : 0).toFixed(0).padStart(3)}% win ${x.r >= 0 ? "+" : ""}${x.r.toFixed(1).padStart(6)}R PF ${Number.isFinite(x.pf) ? x.pf.toFixed(2) : "∞"} DD ${x.dd.toFixed(1)}R`;

  const cutTime = m15[Math.floor(m15.length * 0.7)].time.getTime();
  const filters: [string, (s: Tagged) => boolean][] = [
    ["no filter", () => true],
    ["with 1h trend", (s) => s.trend > 0],
    ["reading leans with it (net ≥ 2)", (s) => s.lean >= 2],
    ["reading leans with it (net ≥ 4)", (s) => s.lean >= 4],
    ["trend + reading net ≥ 2", (s) => s.trend > 0 && s.lean >= 2],
    ["reading leans AGAINST it (net ≤ −2)", (s) => s.lean <= -2],
    ["London + New York (15:00–01:00 UB)", (s) => s.hour >= 15 || s.hour < 1],
    ["London/NY + reading net ≥ 2", (s) => (s.hour >= 15 || s.hour < 1) && s.lean >= 2],
  ];
  const variants: [string, Partial<SmcOptions>][] = [
    ["reaction entry, RR 2", { reaction: true, rr: 2 }],
    ["reaction entry, RR 3", { reaction: true, rr: 3 }],
    ["touch entry (limit at the zone), RR 2", { reaction: false, rr: 2 }],
    ["touch entry, RR 3", { reaction: false, rr: 3 }],
    ["reaction, RR 2, wider swings (3)", { reaction: true, rr: 2, swing: 3 }],
  ];
  let best: { label: string; sel: Tagged[] } | null = null, bestScore = -Infinity;
  for (const [vName, opts] of variants) {
    const all = findSmcSetups(m15, opts).map(tag);
    const kinds = all.reduce((m, s) => m.set(s.zone.kind, (m.get(s.zone.kind) ?? 0) + 1), new Map<string, number>());
    console.log(`\n${vName}: ${all.length} setups (${[...kinds].map(([k, n]) => `${k} ${n}`).join(", ")}), median risk $${[...all].sort((a, b) => a.risk - b.risk)[all.length >> 1]?.risk.toFixed(1)}`);
    console.log("  filter".padEnd(40) + "first 70%".padEnd(44) + "| last 30%");
    for (const [fName, f] of filters) {
      const sel = all.filter(f), e = simulate(sel.filter((s) => s.time < cutTime)), l = simulate(sel.filter((s) => s.time >= cutTime));
      console.log(`  ${fName.padEnd(37)} ${fmt(e)}  |  ${fmt(l)}`);
      // "Holds up" = both halves positive with enough trades; rank by the weaker half.
      const score = e.trades >= 40 && l.trades >= 20 ? Math.min(e.pf, l.pf) : -1;
      if (!fName.includes("AGAINST") && score > bestScore) { bestScore = score; best = { label: `${vName} · ${fName}`, sel }; }
    }
  }
  if (best) {
    console.log(`\nMost consistent across both halves: ${best.label} (weaker half PF ${bestScore.toFixed(2)})`);
    for (const y of [...new Set(best.sel.map((s) => new Date(s.time).getUTCFullYear()))]) console.log(`  ${y}: ${fmt(simulate(best.sel.filter((s) => new Date(s.time).getUTCFullYear() === y)))}`);
    for (const side of ["BUY", "SELL"] as const) console.log(`  ${side}: ${fmt(simulate(best.sel.filter((s) => s.side === side)))}`);
    for (const kind of ["FVG", "OB"] as const) console.log(`  ${kind}: ${fmt(simulate(best.sel.filter((s) => s.zone.kind === kind)))}`);
  }
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
