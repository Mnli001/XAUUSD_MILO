import { simulateTrades, type Signal } from "@/lib/bot/backtest";
import { DEFAULT_PARAMS } from "@/lib/bot/strategy";
import type { Candle } from "@/lib/analysis/indicators";

const P = { ...DEFAULT_PARAMS, spread: 0 };
const BASE = Date.UTC(2026, 10, 16, 8, 0); // Monday 16:00 UB
const bar = (i: number, o: number, h: number, l: number, c: number, base = BASE): Candle => ({ time: new Date(base + i * 15 * 6e4), open: o, high: h, low: l, close: c });
const flat = (i: number, base = BASE) => bar(i, 4000, 4001, 3999, 4000, base);
const run = (bars: Candle[], signals: Signal[], params = P) => simulateTrades(bars, signals, bars.map(() => 4), params, 10_000);
// ATR 4 → stop distance 6, target 12; 0.5% of 10 000 = $50 → 0.08 lots

test("a long that reaches its target makes twice the risk", () => {
  const r = run([flat(0), bar(1, 4000, 4003, 3999, 4002), bar(2, 4002, 4013, 4001, 4012), flat(3)], ["BUY", null, null, null]);
  expect(r.trades).toHaveLength(1);
  expect(r.trades[0]).toMatchObject({ direction: "BUY", lots: 0.08, entryPrice: 4000, stopLoss: 3994, exitPrice: 4012, reason: "TP" });
  expect(r.trades[0].pnl).toBeCloseTo(96);
  expect(r.trades[0].r).toBeCloseTo(2);
  expect(r.finalBalance).toBeCloseTo(10_096);
});
test("a short mirrors it", () => {
  const r = run([flat(0), bar(1, 4000, 4001, 3997, 3998), bar(2, 3998, 3999, 3987, 3988), flat(3)], ["SELL", null, null, null]);
  expect(r.trades[0]).toMatchObject({ direction: "SELL", stopLoss: 4006, exitPrice: 3988, reason: "TP" });
  expect(r.trades[0].pnl).toBeCloseTo(96);
});
test("when stop and target are both inside one bar the stop is assumed", () => {
  const r = run([flat(0), bar(1, 4000, 4015, 3990, 4010), flat(2)], ["BUY", null, null]);
  expect(r.trades[0]).toMatchObject({ exitPrice: 3994, reason: "SL" });
  expect(r.trades[0].pnl).toBeCloseTo(-48);
});
test("after +1R the stop moves to entry and a return exits flat", () => {
  const r = run([flat(0), bar(1, 4000, 4004, 3999, 4003), bar(2, 4003, 4007, 4001, 4005), bar(3, 4005, 4005, 3999.5, 4000), flat(4)], ["BUY", null, null, null, null]);
  expect(r.trades[0]).toMatchObject({ exitPrice: 4000, reason: "BE" });
  expect(r.trades[0].pnl).toBeCloseTo(0);
});
test("spread makes the entry worse", () => {
  const r = simulateTrades([flat(0), bar(1, 4000, 4003, 3999, 4002), flat(2)], ["BUY", null, null], [4, 4, 4], { ...P, spread: 0.3 }, 10_000);
  expect(r.trades[0].entryPrice).toBeCloseTo(4000.3);
  expect(r.trades[0].stopLoss).toBeCloseTo(3994.3);
});
const losers = (n: number) => [flat(0), ...Array.from({ length: n }, (_, k) => bar(k + 1, 4000, 4001, 3990, 3995))];
test("one position at a time and at most two trades per UB day", () => {
  const bars = losers(8);
  const r = run(bars, bars.map(() => "BUY"));
  expect(r.trades).toHaveLength(2);
});
test("trading stops for the day once the daily loss limit is hit", () => {
  const bars = losers(8);
  const r = run(bars, bars.map(() => "BUY"), { ...P, maxTradesPerDay: 10, riskPct: 0.6 });
  expect(r.trades).toHaveLength(2); // −0.6 %, −1.2 % → stop
});
test("the kill switch time is recorded when drawdown reaches the limit", () => {
  const bars = losers(8);
  const r = run(bars, bars.map(() => "BUY"), { ...P, maxTradesPerDay: 10, dailyLossPct: 100, riskPct: 2 });
  expect(r.killSwitchAt).toEqual(r.trades[2].closedAt); // ≈ −2 %, −4 %, −6 %
  expect(r.maxDrawdownPct).toBeGreaterThanOrEqual(5);
});
test("positions are closed before the weekend and nothing opens after Friday 20:00 UTC", () => {
  const fri = Date.UTC(2026, 10, 20, 19, 30);
  const bars = [flat(0, fri), bar(1, 4000, 4002, 3999, 4001, fri), bar(2, 4001.5, 4003, 4000, 4002, fri), flat(3, fri)];
  const r = run(bars, ["BUY", null, "BUY", null]);
  expect(r.trades).toHaveLength(1);
  expect(r.trades[0]).toMatchObject({ reason: "WEEKEND", exitPrice: 4001.5 });
});
test("an open position at the end of the data is closed at the last price", () => {
  const r = run([flat(0), bar(1, 4000, 4003, 3999, 4002)], ["BUY", null]);
  expect(r.trades[0]).toMatchObject({ reason: "END", exitPrice: 4002 });
});
test("no trade when the stop distance or lot size cannot be computed", () => {
  expect(simulateTrades([flat(0), flat(1), flat(2)], ["BUY", null, null], [NaN, NaN, NaN], P, 10_000).trades).toHaveLength(0);
  expect(simulateTrades([flat(0), flat(1), flat(2)], ["BUY", null, null], [4, 4, 4], P, 50).trades).toHaveLength(0); // $0.25 risk < 0.01 lot
});
