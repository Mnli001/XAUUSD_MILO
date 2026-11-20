import { ema, rsi, macdHist, atr, swings } from "@/lib/analysis/indicators";

test("ema seeds with SMA", () => {
  const r = ema([1, 2, 3, 4, 5], 3);
  expect(r.slice(0, 2).every(Number.isNaN)).toBe(true);
  expect(r[2]).toBeCloseTo(2);
  expect(r[3]).toBeCloseTo(3);
  expect(r[4]).toBeCloseTo(4);
});
test("rsi is 100 on only-up series and 0 on only-down", () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  expect(rsi(up).at(-1)).toBeCloseTo(100);
  expect(rsi([...up].reverse()).at(-1)).toBeCloseTo(0);
});
test("macdHist is positive in an accelerating uptrend", () => {
  const c = Array.from({ length: 80 }, (_, i) => 100 + i * i * 0.01);
  expect(macdHist(c).at(-1)!).toBeGreaterThan(0);
});
test("atr of constant-range candles equals the range", () => {
  const cs = Array.from({ length: 30 }, (_, i) => ({ time: new Date(i * 36e5), open: 10, high: 12, low: 9, close: 10 }));
  expect(atr(cs)).toBeCloseTo(3);
});
test("swings finds fractal highs and lows", () => {
  const mk = (h: number, l: number, i: number) => ({ time: new Date(i), open: l, high: h, low: l, close: h });
  const cs = [mk(5, 4, 0), mk(7, 5, 1), mk(6, 3, 2), mk(8, 4, 3), mk(7, 5, 4)];
  expect(swings(cs)).toEqual({ highs: [7, 8], lows: [3] });
});
