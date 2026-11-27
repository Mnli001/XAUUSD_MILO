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
test("the report adds the member's own bot week and the releases due in the week ahead, and goes by push too", async () => {
  const u = await makeUser("a@x.mn");
  const p = await makeUser("p@x.mn"); // push only, no Telegram
  await db.execute(sql`UPDATE users SET access_until = '2027-01-01', telegram_chat_id = '111' WHERE id = ${u.id}`);
  await db.execute(sql`UPDATE users SET access_until = '2027-01-01' WHERE id = ${p.id}`);
  await db.execute(sql`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES ('s1', ${p.id}, 'https://push.test/1', 'k', 'a')`);
  const monday = new Date(Date.UTC(2026, 10, 30, 1, 5));
  await db.insert(schema.signals).values({ key: "k1", setupId: "asian-breakout", name: "Азийн хүрээний breakout", side: "BUY", entry: 4006, stop: 4000, target: 4024, createdAt: new Date(Date.UTC(2026, 10, 24, 8, 30)) });
  await upsertCandles(SYMBOL, "15min", [bar(new Date(Date.UTC(2026, 10, 24, 8, 30)))]);
  // the member's robot: two closed trades last week, one the week before (not counted)
  const deal = (ticket: string, profit: number, day: number) => ({ userId: u.id, login: "5001", ticket, side: "BUY", lots: 0.01, openPrice: 4000, closePrice: 4001, profit, closeTime: new Date(Date.UTC(2026, 10, day, 10)) });
  await db.insert(schema.botDeals).values([deal("1", 12.5, 25), deal("2", -4, 27), deal("3", 100, 20)]);
  await db.insert(schema.economicEvents).values([
    { type: "NFP", title: "Ажил эрхлэлтийн тайлан (NFP)", country: "АНУ", impact: "HIGH", time: new Date(Date.UTC(2026, 11, 4, 13, 30)), source: "t" },
    { type: "RETAIL", title: "Жижиглэн худалдаа", country: "АНУ", impact: "MEDIUM", time: new Date(Date.UTC(2026, 11, 2, 13, 30)), source: "t" },
    { type: "CPI", title: "Хэрэглээний үнийн индекс (CPI)", country: "АНУ", impact: "HIGH", time: new Date(Date.UTC(2026, 11, 10, 13, 30)), source: "t" }, // beyond 7 days
  ]);
  const pushed: { userId: string; title: string; body: string; url: string; tag?: string }[] = [];
  expect(await sendWeeklyReport(monday, send, async (userId, m) => { pushed.push({ userId, ...m }); return 1; })).toBe(3);
  const text = sent.find((s) => s.chat === "111")!.html;
  for (const part of ["Таны бот", "2 арилжаа", "+$8.50", "Ирэх 7 хоногийн чухал мэдээ", "Ажил эрхлэлтийн тайлан (NFP)", "12-04 21:30"]) expect(text).toContain(part);
  expect(text).not.toContain("Жижиглэн");
  expect(text).not.toContain("CPI");
  const admin = sent.find((s) => s.chat === "999")!.html;
  expect(admin).not.toContain("Таны бот"); // no robot, no bot line
  expect(pushed).toEqual([{ userId: p.id, title: "📊 7 хоногийн тайлан · XAUUSD", body: expect.stringContaining("1 дохио"), url: "/performance", tag: "weekly" }]);
  expect(pushed[0].body).toContain("NFP");
});
test("week names and an empty week read sensibly", () => {
  expect(isoWeek(new Date(Date.UTC(2026, 10, 30)))).toBe("2026-W49");
  expect(weeklyText([], [], undefined, null)).toContain("дохио гараагүй");
});
