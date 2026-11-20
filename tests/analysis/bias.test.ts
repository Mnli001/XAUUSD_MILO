import { timeframeScore, combineBias } from "@/lib/analysis/bias";
import { pivots } from "@/lib/analysis/levels";

const trend = (n: number, step: number) =>
  Array.from({ length: n }, (_, i) => {
    const base = 1000 + i * step + Math.sin(i / 3) * Math.abs(step) * 2;
    return { time: new Date(i * 36e5), open: base, high: base + 1, low: base - 1, close: base + step / 2 };
  });

test("steady uptrend scores strongly positive, downtrend negative", () => {
  expect(timeframeScore(trend(300, 1))!).toBeGreaterThanOrEqual(50);
  expect(timeframeScore(trend(300, -1))!).toBeLessThanOrEqual(-50);
});
test("too little history returns null", () => {
  expect(timeframeScore(trend(100, 1))).toBeNull();
});
test("combineBias weights and labels", () => {
  const r = combineBias({ "1day": 100, "4h": 100, "1h": -100, "15min": -100 })!;
  expect(r.total).toBeCloseTo(30);
  expect(r.buyerPct).toBe(65);
  expect(r.label).toBe("ӨСӨХ хандлага");
  expect(combineBias({ "1day": 10, "4h": -10, "1h": 0, "15min": 0 })!.label).toBe("ТОДОРХОЙГҮЙ");
  expect(combineBias({ "1day": null, "4h": null, "1h": null, "15min": null })).toBeNull();
  expect(combineBias({ "1day": null, "4h": null, "1h": -100, "15min": -100 })!.total).toBeCloseTo(-100);
});
test("pivots", () => {
  expect(pivots({ time: new Date(0), open: 0, high: 4120, low: 4080, close: 4100 }))
    .toEqual({ p: 4100, r1: 4120, s1: 4080, r2: 4140, s2: 4060 });
});
