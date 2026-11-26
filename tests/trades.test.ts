import { db, schema } from "@/lib/db";
import { listTrades } from "@/lib/trades";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

beforeAll(resetDb);

test("the old journal is listed for its owner only, newest first, without the picture bytes", async () => {
  const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn");
  const base = { direction: "BUY" as const, lots: 0.1, entryPrice: 2000 };
  await db.insert(schema.trades).values([
    { ...base, userId: a.id, openedAt: new Date("2026-11-01T00:00:00Z"), image: Buffer.from("x"), imageMime: "image/png" },
    { ...base, userId: a.id, openedAt: new Date("2026-11-02T00:00:00Z") },
    { ...base, userId: b.id, openedAt: new Date("2026-11-03T00:00:00Z") },
  ]);
  const rows = await listTrades(a.id);
  expect(rows.map((r) => r.openedAt.toISOString())).toEqual(["2026-11-02T00:00:00.000Z", "2026-11-01T00:00:00.000Z"]);
  expect(rows[0]).not.toHaveProperty("image");
});
