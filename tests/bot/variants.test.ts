import { segmentStats, pickBest, passesValidation, compareVariants, VARIANTS, type VariantRow } from "@/lib/bot/variants";
import { simulateTrades, runBacktest } from "@/lib/bot/backtest";
import { DEFAULT_PARAMS, directionFromScores } from "@/lib/bot/strategy";
import type { Candle } from "@/lib/analysis/indicators";

const tr = (r: number, at = 0) => ({ r, pnl: r * 50, openedAt: new Date(at) });

test("segmentStats works in R multiples", () => {
  expect(segmentStats([2, -1, -1, 0, 2].map((r) => tr(r)))).toEqual({ n: 5, winRate: 40, profitFactor: 2, avgR: 0.4, totalR: 2, maxDrawdownR: 2 });
  expect(segmentStats([])).toEqual({ n: 0, winRate: null, profitFactor: null, avgR: null, totalR: 0, maxDrawdownR: 0 });
  expect(segmentStats([tr(2), tr(2)]).profitFactor).toBeNull(); // no losses
});

const seg = (n: number, avgR: number | null, profitFactor: number | null = 1.5) => ({ n, winRate: 40, profitFactor, avgR, totalR: (avgR ?? 0) * n, maxDrawdownR: 3 });
const row = (name: string, train: ReturnType<typeof seg>, test = seg(30, 0.2)): VariantRow => ({ name, params: DEFAULT_PARAMS, train, test });

test("pickBest takes the best training expectancy among variants with enough trades", () => {
  const rows = [row("a", seg(80, 0.1)), row("b", seg(80, 0.3)), row("tiny", seg(10, 2)), row("neg", seg(90, -0.2))];
  expect(pickBest(rows)!.name).toBe("b");
  expect(pickBest([row("tiny", seg(10, 2)), row("neg", seg(90, -0.2))])).toBeNull();
});
test("validation needs enough unseen trades, positive expectancy and profit factor", () => {
  expect(passesValidation(seg(30, 0.2, 1.4))).toBe(true);
  expect(passesValidation(seg(12, 0.5, 2))).toBe(false);   // too few trades
  expect(passesValidation(seg(30, 0.05, 1.4))).toBe(false); // expectancy too small
  expect(passesValidation(seg(30, 0.2, 1.1))).toBe(false);  // profit factor too small
  expect(passesValidation(seg(30, 0.2, null))).toBe(true);  // no losing trades at all
});

test("breakeven can be switched off", () => {
  const BASE = Date.UTC(2026, 10, 16, 8, 0);
  const bar = (i: number, o: number, h: number, l: number, c: number): Candle => ({ time: new Date(BASE + i * 9e5), open: o, high: h, low: l, close: c });
  const bars = [bar(0, 4000, 4001, 3999, 4000), bar(1, 4000, 4004, 3999, 4003), bar(2, 4003, 4007, 4001, 4005), bar(3, 4005, 4005, 3999.5, 4000), bar(4, 4000, 4001, 3999, 4000)];
  const r = simulateTrades(bars, ["BUY", null, null, null, null], bars.map(() => 4), { ...DEFAULT_PARAMS, spread: 0, breakeven: false }, 10_000);
  expect(r.trades[0].reason).toBe("END");
});
test("1h agreement can be required", () => {
  const scores = { "1day": 60, "4h": 50, "1h": -10, "15min": 100 };
  expect(directionFromScores(scores, DEFAULT_PARAMS)).toBe("BUY");
  expect(directionFromScores(scores, { ...DEFAULT_PARAMS, requireH1Agree: true })).toBeNull();
  expect(directionFromScores({ ...scores, "1h": 10 }, { ...DEFAULT_PARAMS, requireH1Agree: true })).toBe("BUY");
});
test("the variant list is fixed in advance and starts with the approved rules", () => {
  expect(VARIANTS[0]).toEqual({ name: "Анхны дүрэм", params: DEFAULT_PARAMS });
  expect(VARIANTS.length).toBeGreaterThanOrEqual(10);
  expect(new Set(VARIANTS.map((v) => v.name)).size).toBe(VARIANTS.length);
});

test("compareVariants splits each variant's trades by time", () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296) - 0.5;
  const m15: Candle[] = [];
  let price = 3000;
  for (let i = 0; i < 420 * 96; i++) {
    const time = new Date(Date.UTC(2026, 0, 5) + i * 9e5);
    if (time.getUTCDay() === 6 || time.getUTCDay() === 0) continue;
    const open = price, close = open + 0.12 + rnd() * 6;
    m15.push({ time, open, high: Math.max(open, close) + Math.abs(rnd()) * 2, low: Math.min(open, close) - Math.abs(rnd()) * 2, close });
    price = close;
  }
  const agg = (ms: number) => { const out: Candle[] = []; for (const c of m15) { const t = Math.floor(c.time.getTime() / ms) * ms; const l = out.at(-1);
    if (l && l.time.getTime() === t) { l.high = Math.max(l.high, c.high); l.low = Math.min(l.low, c.low); l.close = c.close; } else out.push({ ...c, time: new Date(t) }); } return out; };
  const data = { m15, h1: agg(36e5), h4: agg(4 * 36e5), d1: agg(864e5), news: [] };
  const { rows, splitAt } = compareVariants(data, VARIANTS.slice(0, 3));
  expect(rows.map((r) => r.name)).toEqual(VARIANTS.slice(0, 3).map((v) => v.name));
  const full = runBacktest({ ...data, params: VARIANTS[0].params });
  expect(rows[0].train.n + rows[0].test.n).toBe(full.trades.length);
  expect(rows[0].train.n).toBe(full.trades.filter((t) => t.openedAt < splitAt!).length);
  expect(splitAt!.getTime()).toBeGreaterThan(full.from!.getTime());
  expect(splitAt!.getTime()).toBeLessThan(full.to!.getTime());
});
