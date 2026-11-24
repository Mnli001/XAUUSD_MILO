import { findSmcSetups } from "@/lib/analysis/smc";
import { dayOrderFrom, type DayState, type DaySetupView } from "@/lib/bot/daySignal";
import type { Candle } from "@/lib/analysis/indicators";

const T0 = Date.UTC(2026, 0, 5, 0, 0);
/** [open, high, low, close] rows, 15 minutes apart. */
const series = (rows: number[][]): Candle[] => rows.map(([open, high, low, close], i) => ({ time: new Date(T0 + i * 900_000), open, high, low, close }));
const flat = (n: number, p: number) => Array.from({ length: n }, () => [p, p + 1, p - 1, p]);

/**
 * A textbook long: a swing low at 95, a swing high at 110, a sweep to 93 that closes back above 95,
 * a run up that closes above 110 leaving a gap (104 → 107), a dip back into the gap and a close above it.
 */
const bullish = () => series([
  ...flat(4, 100),
  [100, 101, 98, 99], [99, 100, 96, 97], [97, 98, 95, 96], [96, 99, 96, 98], [98, 102, 97, 101], // swing low 95 at index 6
  [101, 106, 100, 105], [105, 110, 104, 108], [108, 109, 105, 106], [106, 107, 103, 104], // swing high 110 at index 10
  [104, 105, 100, 101], [101, 102, 98, 99], [99, 100, 96, 97],
  [97, 98, 93, 96], // index 16: sweeps 95, closes back above it
  [96, 101, 96, 100], [100, 104, 99, 103.5], [103.5, 109, 103, 108], [108, 113, 107, 112], // index 20 closes above 110; gap: low 107 > high 104 two bars back
  [112, 113, 109, 110], [110, 111, 106, 108.5], // index 22 dips into the gap (top 107) and closes above it, bullish? no: closes below its open
  [108.5, 112, 106.5, 111], // index 23: touches the gap again and closes up, above it
  ...flat(4, 111),
]);

test("a sweep, shift and return to the gap with a reaction is found, with the stop under the sweep", () => {
  const [s] = findSmcSetups(bullish(), { swing: 2, minRisk: 1 });
  expect(s).toBeDefined();
  expect(s).toMatchObject({ side: "BUY", level: 95, sweepAt: 16, shiftAt: 20, at: 23, entry: 111 });
  expect(s.zone).toEqual({ kind: "FVG", top: 107, bottom: 104 });
  expect(s.stop).toBeCloseTo(93 - 0.3);
  expect(s.target).toBeCloseTo(s.entry + 2 * s.risk);
});
test("the mirror image is found as a short", () => {
  const flipped = bullish().map((c) => ({ time: c.time, open: 200 - c.open, high: 200 - c.low, low: 200 - c.high, close: 200 - c.close }));
  const [s] = findSmcSetups(flipped, { swing: 2, minRisk: 1 });
  expect(s).toMatchObject({ side: "SELL", level: 105, at: 23, entry: 89 });
  expect(s.stop).toBeGreaterThan(s.entry);
  expect(s.target).toBeLessThan(s.entry);
});
test("without the return to the zone there is no setup", () => {
  const rows = bullish().slice(0, 21); // stops right after the shift
  expect(findSmcSetups(rows, { swing: 2, minRisk: 1 })).toEqual([]);
});
test("a setup is only decided on candles that exist: cutting the series before the reaction removes it", () => {
  expect(findSmcSetups(bullish().slice(0, 23), { swing: 2, minRisk: 1 })).toEqual([]);
});
test("quiet prices produce nothing", () => {
  expect(findSmcSetups(series(flat(200, 100)))).toEqual([]);
});

describe("the order the robot is given", () => {
  const now = new Date("2026-11-24T10:05:00Z");
  const setup = (o: Partial<DaySetupView>): DaySetupView => ({
    id: Math.round(new Date("2026-11-24T10:00:00Z").getTime() / 1000), side: "SELL", risk: 8.456, entry: 3650, stop: 3658.456, target: 3633.088,
    zone: { kind: "FVG", top: 3653, bottom: 3651 }, level: 3657, sweepAt: now, shiftAt: now, at: now, buy: 3, sell: 8, total: 14, lean: 5, ...o,
  });
  const state = (fresh: DaySetupView | null): DayState => ({ fresh, recent: fresh ? [fresh] : [], asOf: 0 });
  test("a fresh setup the reading backs becomes an order with the stop distance and its age", () => {
    expect(dayOrderFrom(state(setup({})), 2, now)).toEqual({ id: setup({}).id, dir: -1, risk: 8.46, rr: 2, ageSec: 300 });
  });
  test("no order when the reading does not back it, is unknown, or nothing is fresh", () => {
    expect(dayOrderFrom(state(setup({ lean: 1 })), 2, now)).toBeNull();
    expect(dayOrderFrom(state(setup({ total: 0, lean: 0 })), 0, now)).toBeNull();
    expect(dayOrderFrom(state(null), 2, now)).toBeNull();
  });
});
