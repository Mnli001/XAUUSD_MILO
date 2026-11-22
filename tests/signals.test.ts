import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { emitSignals, listSignals, signalText } from "@/lib/signals";
import type { Setup, SetupsView } from "@/lib/setup/build";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

const now = new Date(Date.UTC(2026, 10, 24, 9, 0));
const history = { n: 152, winPct: 34.1, avgR: -0.01, profitFactor: 0.99 };
const setup = (o: Partial<Setup> = {}): Setup => ({
  id: "asian-breakout", name: "Азийн хүрээний breakout", rule: "…", status: "ACTIVE", side: "BUY", headline: "BUY: хүрээнээс дээш гарлаа", detail: "…",
  entry: 4006, stop: 4000, target: 4018, band: { high: 4002, low: 3998 }, checks: [{ label: "Азийн хүрээ бүрдсэн (15:00 УБ)", ok: true }, { label: "Тренд breakout-тай нэг чиглэлд", ok: true }],
  history, recent: history, ...o,
});
const view = (setups: Setup[]): SetupsView => ({ setups, candles: [], lastCandleAt: new Date(now.getTime() - 15 * 6e4), historyFrom: null });

let sent: { chatId: string; text: string }[];
const send = async (chatId: string, text: string) => { sent.push({ chatId, text }); return true; };

beforeEach(async () => {
  await resetDb();
  await db.execute(sql`TRUNCATE signals`);
  sent = [];
  const linked = await makeUser("a@x.mn");
  const expired = await makeUser("b@x.mn");
  await makeUser("c@x.mn"); // has access, never linked Telegram
  await db.execute(sql`UPDATE users SET access_until = '2027-01-01', telegram_chat_id = '111' WHERE id = ${linked.id}`);
  await db.execute(sql`UPDATE users SET access_until = '2020-01-01', telegram_chat_id = '222' WHERE id = ${expired.id}`);
  await db.execute(sql`UPDATE users SET access_until = '2027-01-01' WHERE email = 'c@x.mn'`);
  const admin = await makeUser("adm@x.mn", "ADMIN");
  await db.execute(sql`UPDATE users SET telegram_chat_id = '999' WHERE id = ${admin.id}`);
});

test("the message says what to do, where, and how the rule has done", () => {
  const text = signalText(setup(), new Date(now.getTime() - 15 * 6e4), now);
  for (const part of ["BUY", "XAUUSD", "Азийн хүрээний breakout", "4006.00", "4000.00", "4018.00", "1 : 2.0", "Тренд breakout-тай нэг чиглэлд", "152", "34.1%", "15 минут", "зөвлөгөө биш"]) expect(text).toContain(part);
  expect(signalText(setup({ history: { n: 4, winPct: null, avgR: null, profitFactor: null } }), null, now)).toContain("Дата хангалтгүй");
});
test("an active setup is recorded once and sent to linked users who have access", async () => {
  expect(await emitSignals(now, { view: view([setup()]), send })).toBe(1);
  expect(sent.map((s) => s.chatId).sort()).toEqual(["111", "999"]); // not the expired user, not the unlinked one
  expect(sent[0].text).toContain("4006.00");
  // the next check five minutes later finds the same setup still active
  expect(await emitSignals(new Date(now.getTime() + 5 * 6e4), { view: view([setup()]), send })).toBe(0);
  expect(sent).toHaveLength(2);
  const list = await listSignals(10);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ setupId: "asian-breakout", side: "BUY", entry: 4006, stop: 4000, target: 4018, sentTo: 2 });
});
test("setups that are only being watched, or off, send nothing", async () => {
  expect(await emitSignals(now, { view: view([setup({ status: "WATCH" }), setup({ id: "trend-dip", status: "OFF", side: null, entry: null, stop: null, target: null })]), send })).toBe(0);
  expect(sent).toHaveLength(0);
});
test("the Asian breakout can signal again the next day; the dip rule waits out its eight-hour trade", async () => {
  const dip = setup({ id: "trend-dip", name: "Тренд доторх уналтыг авах" });
  expect(await emitSignals(now, { view: view([setup(), dip]), send })).toBe(2);
  expect(await emitSignals(new Date(now.getTime() + 3 * 36e5), { view: view([dip]), send })).toBe(0);
  expect(await emitSignals(new Date(now.getTime() + 9 * 36e5), { view: view([dip]), send })).toBe(1);
  expect(await emitSignals(new Date(now.getTime() + 24 * 36e5), { view: view([setup()]), send })).toBe(1);
});
test("a failed send does not stop the others or lose the signal", async () => {
  const flaky = async (chatId: string, text: string) => { if (chatId === "111") throw new Error("blocked"); return send(chatId, text); };
  expect(await emitSignals(now, { view: view([setup()]), send: flaky })).toBe(1);
  expect((await listSignals(10))[0].sentTo).toBe(1);
});

test("a user who paused signals, or muted this setup, is skipped; the others still get it", async () => {
  await db.execute(sql`UPDATE users SET signals_paused = true WHERE telegram_chat_id = '111'`);
  await db.execute(sql`UPDATE users SET signals_muted = 'asian-breakout' WHERE telegram_chat_id = '999'`);
  const dip = setup({ id: "trend-dip", name: "Тренд доторх уналтыг авах" });
  expect(await emitSignals(now, { view: view([setup(), dip]), send })).toBe(2);
  expect(sent.map((s) => s.chatId)).toEqual(["999"]); // only the dip, only to the user who muted the other one
  expect(sent[0].text).toContain("Тренд доторх уналтыг авах");
});
test("each user gets the message in their own language", async () => {
  await db.execute(sql`UPDATE users SET locale = 'en', time_zone = 'Europe/London' WHERE telegram_chat_id = '999'`);
  const english = setup({ name: "Asian range breakout", checks: [{ label: "Asian range complete (07:00 London)", ok: true }] });
  const asked: string[] = [];
  const viewFor = async (v: { locale: string; timeZone: string }) => { asked.push(`${v.locale} ${v.timeZone}`); return view([english]); };
  expect(await emitSignals(now, { view: view([setup()]), viewFor, send })).toBe(1);
  expect(asked).toEqual(["en Europe/London"]); // the default reading is reused for everyone else
  const byChat = Object.fromEntries(sent.map((s) => [s.chatId, s.text]));
  expect(byChat["111"]).toContain("Баталгаажсан нөхцөл:");
  expect(byChat["111"]).toContain("Азийн хүрээ бүрдсэн (15:00 УБ)");
  for (const part of ["Asian range breakout", "Entry: around 4006.00", "Conditions met:", "Asian range complete (07:00 London)", "152 trades, 34.1% profitable", "not financial advice"]) expect(byChat["999"]).toContain(part);
  expect(byChat["999"]).not.toMatch(/[Ѐ-ӿ]/);
});
