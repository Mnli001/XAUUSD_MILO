import { count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ingestPrices, recomputeSnapshot } from "@/lib/ingest/prices";
import { ProviderError } from "@/lib/data/priceProvider";
import { POST } from "@/app/api/cron/prices/route";
import { resetDb } from "../helpers/db";
import { seedCandles, fakeProvider } from "../helpers/candles";

const candleCount = async (tf?: string) =>
  (await db.select({ c: count() }).from(schema.candles).where(tf ? eq(schema.candles.timeframe, tf) : undefined))[0].c;

beforeEach(resetDb);

test("provider failure keeps stored candles and reports ok:false", async () => {
  await seedCandles("15min", 50);
  const failing = { fetchCandles: async () => { throw new ProviderError("limit", 429); } };
  const r = await ingestPrices(failing, { tfs: ["15min"], now: new Date() });
  expect(r).toMatchObject({ ok: false, stored: 0 });
  expect(r.error).toContain("limit");
  expect(await candleCount()).toBe(50);
});
test("re-ingesting the same candles does not duplicate", async () => {
  const p = fakeProvider(30);
  const first = await ingestPrices(p, { tfs: ["15min"], now: new Date("2026-11-20T10:05:00Z") });
  await ingestPrices(p, { tfs: ["15min"], now: new Date("2026-11-20T10:05:00Z") });
  expect(first).toMatchObject({ ok: true, stored: 30 });
  expect(await candleCount("15min")).toBe(30);
});
test("recomputeSnapshot writes bias, hourly table and levels once there is enough history", async () => {
  const lastAt = new Date("2026-11-20T10:00:00Z");
  await seedCandles("1h", 3000, { lastAt });
  await seedCandles("1day", 300, { lastAt: new Date("2026-11-20T00:00:00Z") });
  await recomputeSnapshot("XAUUSD", new Date("2026-11-20T10:05:00Z"));
  const [s] = await db.select().from(schema.biasSnapshots);
  expect(s.label).toBe("ӨСӨХ хандлага");
  expect(s.buyerPct).toBeGreaterThan(50);
  expect((s.hourly as unknown[]).length).toBe(24);
  expect(s.perTimeframe).toMatchObject({ "15min": null, "4h": null });
  const lv = s.levels as { p: number; atr: number; prevHigh: number };
  expect(lv.prevHigh).toBeGreaterThan(lv.p);
  expect(lv.atr).toBeGreaterThan(0);
});
test("recomputeSnapshot writes nothing when no timeframe has enough history", async () => {
  await seedCandles("15min", 20);
  await recomputeSnapshot("XAUUSD", new Date());
  expect(await db.select().from(schema.biasSnapshots)).toHaveLength(0);
});
test("cron route rejects requests without the bearer secret", async () => {
  const res = await POST(new Request("http://x/api/cron/prices?scope=fast", { method: "POST" }));
  expect(res.status).toBe(401);
  const bad = await POST(new Request("http://x/api/cron/prices?scope=fast", { method: "POST", headers: { authorization: "Bearer nope" } }));
  expect(bad.status).toBe(401);
});
