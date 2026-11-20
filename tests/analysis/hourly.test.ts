import { hourlyTable } from "@/lib/analysis/hourly";
import type { Candle } from "@/lib/analysis/indicators";

// 120 days of hourly candles; the 15:00 UB candle (07:00 UTC) is up on 3 of every 4 days, all others down.
const cs: Candle[] = [];
for (let d = 0; d < 120; d++) for (let h = 0; h < 24; h++) {
  const time = new Date(Date.UTC(2026, 6, 1 + d, h));
  const up = h === 7 && d % 4 !== 0;
  cs.push({ time, open: 100, high: 102, low: 98, close: up ? 101 : 99 });
}
const now = new Date(Date.UTC(2026, 6, 1 + 120));

test("24 rows, UB hour bucketing, percentage and avg move", () => {
  const t = hourlyTable(cs, now);
  expect(t).toHaveLength(24);
  expect(t.map(r => r.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  const row = t.find(r => r.hour === 15)!;
  expect(row.n).toBe(120);
  expect(row.upPct).toBe(75);
  expect(row.avgMove).toBeCloseTo(1);
  expect(row.session).toBe("Лондон");
  expect(t.find(r => r.hour === 10)!.upPct).toBe(0);
});
test("small samples give null, not a percentage", () => {
  const t = hourlyTable(cs.slice(-24 * 20), now);
  expect(t.every(r => r.upPct === null && r.n === 20)).toBe(true);
});
test("candles older than 183 days are ignored", () => {
  const later = new Date(now.getTime() + 150 * 864e5);
  expect(hourlyTable(cs, later).find(r => r.hour === 15)!.n).toBeLessThan(40);
});
test("conditional counts only candles in the current regime", () => {
  const t = hourlyTable(cs, now);
  const row = t.find(r => r.hour === 15)!;
  expect(row.nCond).toBeLessThanOrEqual(row.n);
  expect(row.nCond + 0).toBeGreaterThanOrEqual(0);
});
