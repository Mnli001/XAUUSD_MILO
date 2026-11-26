import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isoWeek, marketOpen, sendWeeklyReport, watchFeed, weeklyText } from "@/lib/watch";
import { upsertCandles, SYMBOL } from "@/lib/ingest/prices";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

let sent: { chat: string; html: string }[];
const send = async (chat: string, html: string) => { sent.push({ chat, html }); return true; };
const bar = (t: Date) => ({ time: t, open: 4000, high: 4002, low: 3998, close: 4000 });

beforeEach(async () => {
  await resetDb();
  await db.execute(sql`TRUNCATE signals, app_state`);
  sent = [];
  const admin = await makeUser("adm@x.mn", "ADMIN");
  await db.execute(sql`UPDATE users SET telegram_chat_id = '999' WHERE id = ${admin.id}`);
});

test("the market is shut from Friday 21:00 to Sunday 22:00 UTC", () => {
  expect(marketOpen(new Date(Date.UTC(2026, 10, 27, 20)))).toBe(true); // Friday
  expect(marketOpen(new Date(Date.UTC(2026, 10, 27, 21)))).toBe(false);
  expect(marketOpen(new Date(Date.UTC(2026, 10, 28, 12)))).toBe(false); // Saturday
  expect(marketOpen(new Date(Date.UTC(2026, 10, 29, 22)))).toBe(true); // Sunday night
});
test("late prices raise one alert to the admins, and one note when they are back", async () => {
  const now = new Date(Date.UTC(2026, 10, 24, 12));
  await upsertCandles(SYMBOL, "15min", [bar(new Date(Date.UTC(2026, 10, 24, 9)))]);
  expect(await watchFeed(now, send)).toBe("late");
  expect(await watchFeed(new Date(now.getTime() + 5 * 6e4), send)).toBeNull(); // not twice
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ chat: "999" });
  expect(sent[0].html).toContain("хоцорч");
  await upsertCandles(SYMBOL, "15min", [bar(new Date(Date.UTC(2026, 10, 24, 11, 45)))]);
  expect(await watchFeed(new Date(Date.UTC(2026, 10, 24, 12, 5)), send)).toBe("back");
  expect(sent).toHaveLength(2);
});
test("quiet prices over the weekend are not an alert", async () => {
  await upsertCandles(SYMBOL, "15min", [bar(new Date(Date.UTC(2026, 10, 27, 20, 45)))]);
  expect(await watchFeed(new Date(Date.UTC(2026, 10, 28, 12)), send)).toBeNull();
  expect(sent).toHaveLength(0);
});
test("the weekly report goes out once on Monday morning with last week's and all-time results", async () => {
  const u = await makeUser("a@x.mn");
  await db.execute(sql`UPDATE users SET access_until = '2027-01-01', telegram_chat_id = '111' WHERE id = ${u.id}`);
  const monday = new Date(Date.UTC(2026, 10, 30, 1, 5));
  await db.insert(schema.signals).values({ key: "k1", setupId: "asian-breakout", name: "Азийн хүрээний breakout", side: "BUY", entry: 4006, stop: 4000, target: 4024, createdAt: new Date(Date.UTC(2026, 10, 24, 8, 30)) });
  await upsertCandles(SYMBOL, "15min", Array.from({ length: 96 }, (_, i) => ({ ...bar(new Date(Date.UTC(2026, 10, 24) + i * 9e5)), ...(i === 40 ? { high: 4025, low: 4010 } : {}), close: 4006, open: 4006, high: i === 40 ? 4025 : 4008, low: i === 40 ? 4010 : 4004 })));
  expect(await sendWeeklyReport(new Date(Date.UTC(2026, 10, 29, 12)), send)).toBe(0); // Sunday: not yet
  expect(await sendWeeklyReport(monday, send)).toBe(2); // the user and the admin
  expect(await sendWeeklyReport(new Date(monday.getTime() + 36e5), send)).toBe(0); // once a week
  const text = sent.find((s) => s.chat === "111")!.html;
  for (const part of ["7 хоногийн тайлан", "1 дохио", "ашигтай 1", "+3.00R"]) expect(text).toContain(part);
});
test("week names and an empty week read sensibly", () => {
  expect(isoWeek(new Date(Date.UTC(2026, 10, 30)))).toBe("2026-W49");
  expect(weeklyText([], [], undefined, null)).toContain("дохио гараагүй");
});
