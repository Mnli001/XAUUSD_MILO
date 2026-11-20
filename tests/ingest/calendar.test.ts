import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ingestCalendar } from "@/lib/ingest/calendar";
import { upsertCandles } from "@/lib/ingest/prices";
import { getNextHighEvent } from "@/lib/events";
import { POST } from "@/app/api/cron/calendar/route";
import { ProviderError } from "@/lib/data/priceProvider";
import { resetDb } from "../helpers/db";
import { buildEvents } from "../helpers/events";

beforeEach(resetDb);
const now = new Date("2026-11-20T00:00:00Z");

test("ingest stores typed events once, keeps admin edits, and computes reactions", async () => {
  const { times, m15 } = buildEvents([10, 10, 10, 10, 10, 10, -10, -10]);
  await upsertCandles("XAUUSD", "15min", m15);
  const future = new Date("2026-12-10T13:30:00Z");
  const provider = { fetchEvents: async () => [...times, future].map((time) => ({ type: "CPI", time })) };

  expect(await ingestCalendar(provider, now)).toMatchObject({ ok: true, stored: 9 });
  await db.update(schema.economicEvents).set({ forecast: "3.1%" }).where(eq(schema.economicEvents.time, future));
  await ingestCalendar(provider, now);

  const rows = await db.select().from(schema.economicEvents);
  expect(rows).toHaveLength(9);
  expect(rows.find((r) => r.time.getTime() === future.getTime())).toMatchObject({ forecast: "3.1%", impact: "HIGH", source: "fred", title: "Хэрэглээний үнийн индекс (CPI)" });
  const [reaction] = await db.select().from(schema.eventReactions);
  expect(reaction).toMatchObject({ type: "CPI", n: 8 });
  expect((reaction.stats as { minutes: number; upPct: number }[])[0]).toMatchObject({ minutes: 15, upPct: 75 });
  expect((await getNextHighEvent(now))!.time).toEqual(future);
});
test("provider failure is reported and stored events stay", async () => {
  const failing = { fetchEvents: async () => { throw new ProviderError("down", 500); } };
  expect(await ingestCalendar(failing, now)).toMatchObject({ ok: false, stored: 0 });
});
test("cron route rejects requests without the bearer secret", async () => {
  expect((await POST(new Request("http://x/api/cron/calendar", { method: "POST" }))).status).toBe(401);
});
