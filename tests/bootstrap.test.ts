import { count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureAdmin, verifyCredentials } from "@/lib/users";
import { runBackfill, needsBackfill, BACKFILL_PLAN } from "@/lib/ingest/backfill";
import { ProviderError, type PriceProvider } from "@/lib/data/priceProvider";
import type { Candle, Timeframe } from "@/lib/analysis/indicators";
import { resetDb } from "./helpers/db";

beforeEach(resetDb);
const n = async (tf: string) => (await db.select({ c: count() }).from(schema.candles).where(eq(schema.candles.timeframe, tf)))[0].c;

test("ensureAdmin creates the admin once and never resets an existing password", async () => {
  expect(await ensureAdmin("Boss@x.mn", "first-password")).toBe("created");
  expect((await verifyCredentials("boss@x.mn", "first-password"))?.role).toBe("ADMIN");
  expect(await ensureAdmin("boss@x.mn", "another-password")).toBe("exists");
  expect(await verifyCredentials("boss@x.mn", "another-password")).toBeNull();
  expect(await ensureAdmin(undefined, "x")).toBe("skipped");
  expect(await ensureAdmin("short@x.mn", "short")).toBe("invalid");
});
test("an existing ordinary user with the admin email is promoted, password untouched", async () => {
  await db.insert(schema.users).values({ email: "u@x.mn", name: "U", passwordHash: "hash" });
  expect(await ensureAdmin("u@x.mn", "whatever-123")).toBe("exists");
  const [u] = await db.select().from(schema.users);
  expect(u).toMatchObject({ role: "ADMIN", passwordHash: "hash" });
});

const STEP: Record<Timeframe, number> = { "15min": 9e5, "1h": 36e5, "4h": 144e5, "1day": 864e5 };
function pagedProvider(now: number, calls: string[]): PriceProvider {
  return {
    async fetchCandles(_s, tf, { outputsize, endDate }) {
      calls.push(`${tf}:${endDate ? "page" : "first"}`);
      const end = endDate ? endDate.getTime() : now;
      return Array.from({ length: outputsize }, (_, i): Candle => {
        const time = new Date(end - (outputsize - 1 - i) * STEP[tf]);
        return { time, open: 1, high: 2, low: 0.5, close: 1.5 };
      });
    },
  };
}
test("backfill pages backwards until the wanted history is covered", async () => {
  const calls: string[] = [];
  const now = Date.UTC(2026, 10, 20);
  const plan = [{ tf: "1day" as const, size: 50, days: 0 }, { tf: "15min" as const, size: 200, days: 5 }];
  const r = await runBackfill(pagedProvider(now, calls), { plan, sleepMs: 0, now: new Date(now) });
  expect(r.failed).toEqual([]);
  expect(calls.filter((c) => c.startsWith("1day"))).toEqual(["1day:first"]);
  expect(calls.filter((c) => c.startsWith("15min")).length).toBe(3); // 200 bars ≈ 2.08 days per page → 3 pages for 5 days
  expect(await n("1day")).toBe(50);
  expect(await n("15min")).toBe(598); // pages overlap by one bar each
});
test("a timeframe that keeps failing is reported and the others still load", async () => {
  const good = pagedProvider(Date.UTC(2026, 10, 20), []);
  const provider: PriceProvider = { fetchCandles: (s, tf, o) => (tf === "4h" ? Promise.reject(new ProviderError("down", 500)) : good.fetchCandles(s, tf, o)) };
  const plan = [{ tf: "4h" as const, size: 10, days: 0 }, { tf: "1h" as const, size: 10, days: 0 }];
  const r = await runBackfill(provider, { plan, sleepMs: 0, retryDelayMs: 0, attempts: 2, now: new Date(Date.UTC(2026, 10, 20)) });
  expect(r.failed).toEqual(["4h"]);
  expect(await n("1h")).toBe(10);
});
test("backfill is needed only while the 15-minute history is thin", () => {
  expect(needsBackfill(0)).toBe(true);
  expect(needsBackfill(4999)).toBe(true);
  expect(needsBackfill(5000)).toBe(false);
  expect(BACKFILL_PLAN.map((p) => p.tf)).toEqual(["1day", "4h", "1h", "15min"]);
});
