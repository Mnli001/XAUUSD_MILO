import { getTodaySnapshot } from "@/lib/snapshot";
import { recomputeSnapshot } from "@/lib/ingest/prices";
import { resetDb } from "./helpers/db";
import { seedCandles } from "./helpers/candles";

beforeEach(resetDb);

test("empty database gives an all-null snapshot, not an exception", async () => {
  expect(await getTodaySnapshot("XAUUSD", new Date())).toEqual({ price: null, bias: null, hourly: null, levels: null });
});
test("stale flag after 30 minutes without a new 15min candle", async () => {
  await seedCandles("15min", 10, { lastAt: new Date("2026-11-20T10:00:00Z") });
  expect((await getTodaySnapshot("XAUUSD", new Date("2026-11-20T10:20:00Z"))).price!.stale).toBe(false);
  expect((await getTodaySnapshot("XAUUSD", new Date("2026-11-21T10:00:00Z"))).price!.stale).toBe(true);
});
test("price change is measured against the previous daily close; bias and levels come from the newest snapshot", async () => {
  await seedCandles("15min", 10, { lastAt: new Date("2026-11-20T10:00:00Z") });
  await seedCandles("1h", 3000, { lastAt: new Date("2026-11-20T10:00:00Z") });
  await seedCandles("1day", 300, { lastAt: new Date("2026-11-20T00:00:00Z") });
  await recomputeSnapshot("XAUUSD", new Date("2026-11-20T10:05:00Z"));
  const s = await getTodaySnapshot("XAUUSD", new Date("2026-11-20T10:06:00Z"));
  expect(s.price!.last).toBeGreaterThan(0);
  expect(s.price!.changePct).toBeCloseTo(((s.price!.last - s.levels!.prevClose) / s.levels!.prevClose) * 100);
  expect(s.bias!.label).toBe("ӨСӨХ хандлага");
  expect(s.hourly).toHaveLength(24);
});
