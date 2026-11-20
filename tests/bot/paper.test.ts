import { paperReport, paperVerdict, PAPER_MIN_TRADES } from "@/lib/bot/paper";
import type { Candle } from "@/lib/analysis/indicators";
import { makeCandles } from "../helpers/candles";

const TUE = Date.UTC(2026, 10, 17, 0, 0); // Tuesday 00:00 UTC
const bar = (i: number, o: number, h: number, l: number, c: number): Candle => ({ time: new Date(TUE + i * 9e5), open: o, high: h, low: l, close: c });
// Asian range 3995–4005, breakout close at 07:30, entry 07:30 bar, target reached in the 07:45 bar
const m15 = [
  ...Array.from({ length: 28 }, (_, i) => bar(i, 4000, 4005, 3995, 4000)),
  bar(28, 4000, 4004, 3999, 4003),
  bar(29, 4003, 4009, 4002, 4008),
  bar(30, 4008, 4012, 4007, 4011),
  bar(31, 4011, 4026, 4010, 4025),
  bar(32, 4025, 4026, 3000, 3001), // still forming in every test below
];
const d1 = makeCandles("1day", 300, new Date("2026-11-16T00:00:00Z")); // steady uptrend, last candle closed
const data = { m15, d1, news: [] as Date[] };
const at = (hhmm: string) => new Date(`2026-11-17T${hhmm}:00Z`);
const MON = new Date("2026-11-16T00:00:00Z");

test("a closed paper trade is reported with its R and the balance moves", () => {
  const r = paperReport(data, MON, at("08:05"));
  expect(r.closed).toHaveLength(1);
  expect(r.closed[0]).toMatchObject({ direction: "BUY", reason: "TP", lots: 0.06 });
  expect(r.closed[0].entryPrice).toBeCloseTo(4008.3);
  expect(r.closed[0].r).toBeCloseTo(2);
  expect(r.open).toBeNull();
  expect(r.balance).toBeCloseTo(10_096);
  expect(r.stats.n).toBe(1);
  expect(r.verdict).toBe("PENDING");
});
test("a bar that has not closed yet is ignored, so the trade is still open", () => {
  const r = paperReport(data, MON, at("07:50"));
  expect(r.closed).toHaveLength(0);
  expect(r.open).toMatchObject({ direction: "BUY", lots: 0.06 });
  expect(r.open!.entryPrice).toBeCloseTo(4008.3);
  expect(r.open!.stopLoss).toBeCloseTo(4000.3);
  expect(r.balance).toBe(10_000); // unrealised profit is not counted
  expect(r.stats.n).toBe(0);
});
test("signals decided before the start time are not traded", () => {
  const r = paperReport(data, at("07:40"), at("08:05"));
  expect(r.closed).toHaveLength(0);
  expect(r.open).toBeNull();
});
test("nothing is traded against the daily trend", () => {
  const down = makeCandles("1day", 300, new Date("2026-11-16T00:00:00Z"), -0.5);
  expect(paperReport({ ...data, d1: down }, MON, at("08:05")).closed).toHaveLength(0);
});
test("today's status shows the range and what the bot is waiting for", () => {
  expect(paperReport(data, MON, at("03:00")).today).toMatchObject({ phase: "RANGE", rangeHigh: 4005, rangeLow: 3995, trend: "UP" });
  expect(paperReport(data, MON, at("07:20")).today).toMatchObject({ phase: "WATCHING" });
  expect(paperReport(data, MON, at("08:05")).today).toMatchObject({ phase: "DONE" });
});
test("empty data gives an empty report", () => {
  const r = paperReport({ m15: [], d1: [], news: [] }, MON, at("08:05"));
  expect(r).toMatchObject({ closed: [], open: null, balance: 10_000, verdict: "PENDING" });
  expect(r.today).toMatchObject({ phase: "NO_DATA", trend: null });
});
test("the verdict waits for 40 trades and then applies the pre-set thresholds", () => {
  const s = (n: number, avgR: number, profitFactor: number | null) => ({ n, winRate: 40, profitFactor, avgR, totalR: avgR * n, maxDrawdownR: 3 });
  expect(PAPER_MIN_TRADES).toBe(40);
  expect(paperVerdict(s(39, 1, 3))).toBe("PENDING");
  expect(paperVerdict(s(40, 0.15, 1.3))).toBe("PASSED");
  expect(paperVerdict(s(40, 0.05, 1.3))).toBe("FAILED");
  expect(paperVerdict(s(60, 0.2, 1.1))).toBe("FAILED");
});
