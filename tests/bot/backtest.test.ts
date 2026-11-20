import { buildSignals, runBacktest, verdict } from "@/lib/bot/backtest";
import { DEFAULT_PARAMS } from "@/lib/bot/strategy";
import { performance } from "@/lib/analysis/journal";
import type { Candle } from "@/lib/analysis/indicators";

// Deterministic drifting random walk on 15-minute bars, aggregated into the higher timeframes.
function synth(days: number, drift: number) {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296) - 0.5;
  const m15: Candle[] = [];
  let price = 3000;
  const start = Date.UTC(2026, 0, 5); // a Monday
  for (let i = 0; i < days * 96; i++) {
    const time = new Date(start + i * 15 * 6e4);
    const d = time.getUTCDay();
    if (d === 6 || d === 0) continue;
    const open = price;
    const close = open + drift + rnd() * 6;
    m15.push({ time, open, high: Math.max(open, close) + Math.abs(rnd()) * 2, low: Math.min(open, close) - Math.abs(rnd()) * 2, close });
    price = close;
  }
  const agg = (ms: number) => {
    const out: Candle[] = [];
    for (const c of m15) {
      const t = Math.floor(c.time.getTime() / ms) * ms;
      const last = out.at(-1);
      if (last && last.time.getTime() === t) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; }
      else out.push({ ...c, time: new Date(t) });
    }
    return out;
  };
  return { m15, h1: agg(36e5), h4: agg(4 * 36e5), d1: agg(864e5) };
}
const data = synth(420, 0.12);

test("the synthetic uptrend produces buy signals only inside the session", () => {
  const { signals, readyFrom } = buildSignals({ ...data, news: [] });
  const buys = signals.filter((s) => s === "BUY").length;
  expect(readyFrom).toBeGreaterThan(0);
  expect(buys).toBeGreaterThan(10);
  expect(signals.slice(0, readyFrom).every((s) => s === null)).toBe(true);
  signals.forEach((s, i) => {
    if (!s) return;
    const h = (new Date(data.m15[i].time.getTime() + 15 * 6e4).getUTCHours() + 8) % 24;
    expect(h >= 15 || h < 1).toBe(true);
  });
});
test("signals never change when later data is appended (no look-ahead)", () => {
  const full = buildSignals({ ...data, news: [] }).signals;
  const cut = data.m15[Math.floor(data.m15.length * 0.8)].time.getTime();
  const before = (cs: Candle[]) => cs.filter((c) => c.time.getTime() <= cut);
  const m15 = before(data.m15);
  const part = buildSignals({ m15, h1: before(data.h1), h4: before(data.h4), d1: before(data.d1), news: [] }).signals;
  // higher-timeframe candles that were still forming at the cut are excluded from the comparison
  const safe = m15.length - 96;
  expect(part.slice(0, safe)).toEqual(full.slice(0, safe));
});
test("a news window removes the signals inside it", () => {
  const base = buildSignals({ ...data, news: [] }).signals;
  const i = base.findIndex((s) => s !== null);
  const at = new Date(data.m15[i].time.getTime() + 15 * 6e4);
  const withNews = buildSignals({ ...data, news: [at] }).signals;
  expect(withNews[i]).toBeNull();
  expect(withNews.filter(Boolean).length).toBeLessThan(base.filter(Boolean).length);
});
test("runBacktest totals are consistent", () => {
  const r = runBacktest({ ...data, news: [] });
  const sum = r.trades.reduce((a, t) => a + t.pnl, 0);
  expect(r.trades.length).toBeGreaterThan(0);
  expect(r.finalBalance).toBeCloseTo(10_000 + sum, 6);
  expect(r.returnPct).toBeCloseTo((sum / 10_000) * 100, 6);
  expect(r.stats.count).toBe(r.trades.length);
  expect(Object.values(r.byReason).reduce((a, b) => a + b, 0)).toBe(r.trades.length);
  expect(r.months.reduce((a, m) => a + m.trades, 0)).toBe(r.trades.length);
  expect(r.trades.every((t) => t.lots >= 0.01 && t.closedAt >= t.openedAt)).toBe(true);
  expect(r.from!.getTime()).toBeGreaterThan(data.m15[0].time.getTime());
});
test("empty data gives an empty, well-formed result", () => {
  const r = runBacktest({ m15: [], h1: [], h4: [], d1: [], news: [] });
  expect(r).toMatchObject({ trades: [], finalBalance: 10_000, returnPct: 0, from: null, to: null, verdict: "INSUFFICIENT", signalCount: 0 });
});
test("verdict is strict", () => {
  const stats = (count: number, profitFactor: number | null) => ({ ...performance([]), count, profitFactor });
  expect(verdict({ stats: stats(12, 3), returnPct: 20, maxDrawdownPct: 1 })).toBe("INSUFFICIENT");
  expect(verdict({ stats: stats(80, 0.8), returnPct: -4, maxDrawdownPct: 6 })).toBe("LOSING");
  expect(verdict({ stats: stats(80, 1.1), returnPct: 2, maxDrawdownPct: 4 })).toBe("MARGINAL");
  expect(verdict({ stats: stats(80, 1.6), returnPct: 9, maxDrawdownPct: 12 })).toBe("MARGINAL");
  expect(verdict({ stats: stats(80, 1.6), returnPct: 9, maxDrawdownPct: 4 })).toBe("PROMISING");
  expect(DEFAULT_PARAMS.rr).toBe(2);
});
