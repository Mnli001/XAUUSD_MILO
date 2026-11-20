import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { startPaper, getPaperStart, getPaperReport } from "@/lib/bot/paperDb";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";
import { seedCandles } from "../helpers/candles";

beforeEach(async () => { await resetDb(); await db.execute(sql`TRUNCATE bot_state`); });

test("paper trading is not started until an admin starts it, and the start time never moves", async () => {
  const admin = await makeUser("admin@x.mn", "ADMIN");
  const user = await makeUser("u@x.mn");
  expect(await getPaperStart()).toBeNull();
  expect(await getPaperReport(new Date())).toBeNull();
  await expect(startPaper(user.id, new Date("2026-11-21T00:00:00Z"))).rejects.toThrow();
  expect(await getPaperStart()).toBeNull();
  const first = await startPaper(admin.id, new Date("2026-11-21T00:00:00Z"));
  const second = await startPaper(admin.id, new Date("2026-12-25T00:00:00Z"));
  expect(first.toISOString()).toBe("2026-11-21T00:00:00.000Z");
  expect(second).toEqual(first);
  expect(await getPaperStart()).toEqual(first);
});
test("the report is built from stored candles", async () => {
  const admin = await makeUser("admin@x.mn", "ADMIN");
  await seedCandles("15min", 400, { lastAt: new Date("2026-11-20T10:00:00Z") });
  await seedCandles("1day", 300, { lastAt: new Date("2026-11-19T00:00:00Z") });
  await startPaper(admin.id, new Date("2026-11-18T00:00:00Z"));
  const r = (await getPaperReport(new Date("2026-11-20T10:20:00Z")))!;
  expect(r.startedAt.toISOString()).toBe("2026-11-18T00:00:00.000Z");
  expect(r.lastBarAt!.toISOString()).toBe("2026-11-20T10:00:00.000Z");
  expect(r.today.trend).toBe("UP");
  expect(r.balance).toBeCloseTo(10_000 + r.closed.reduce((a, t) => a + t.pnl, 0), 6);
});
