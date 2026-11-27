import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { db as database, schema } from "@/lib/db";
import { NOT_SENT, emitNewsAlerts, emitSignals, listSignals, newsText, signalText } from "@/lib/signals";
import { ENTRY_FRESH_MS } from "@/lib/setup/build";
import { telegramTiming } from "@/lib/telegram";
import { viewer } from "@/lib/viewer";
import type { Setup, SetupsView } from "@/lib/setup/build";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import type { PushMessage } from "@/lib/push";

let pushed: { userId: string; msg: PushMessage }[];
const push = async (userId: string, msg: PushMessage) => { pushed.push({ userId, msg }); return 1; };
const subscribe = (email: string) => db.execute(sql`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) SELECT gen_random_uuid()::text, id, 'https://push.test/' || id, 'k', 'a' FROM users WHERE email = ${email}`);
const idOf = async (email: string) => ((await db.execute(sql`SELECT id FROM users WHERE email = ${email}`)).rows[0] as { id: string }).id;

const now = new Date(Date.UTC(2026, 10, 24, 9, 0));
const history = { n: 152, winPct: 34.1, avgR: -0.01, profitFactor: 0.99 };
const setup = (o: Partial<Setup> = {}): Setup => ({
  id: "asian-breakout", name: "Азийн хүрээний breakout", rule: "…", status: "ACTIVE", side: "BUY", headline: "BUY: хүрээнээс дээш гарлаа", detail: "…",
  entry: 4006, stop: 4000, target: 4018, band: { high: 4002, low: 3998 }, checks: [{ label: "Азийн хүрээ бүрдсэн (15:00 УБ)", ok: true }, { label: "Trend breakout-тай нэг чиглэлд", ok: true }],
  history, recent: history, ...o,
});
const view = (setups: Setup[]): SetupsView => ({ setups, candles: [], lastCandleAt: new Date(now.getTime() - 15 * 6e4), historyFrom: null });

let sent: { chatId: string; text: string }[];
const send = async (chatId: string, text: string) => { sent.push({ chatId, text }); return true; };

const realSleep = telegramTiming.sleep;
afterEach(() => { telegramTiming.sleep = realSleep; });
beforeEach(async () => {
  telegramTiming.sleep = async () => {};
  await resetDb();
  await db.execute(sql`TRUNCATE signals`);
  sent = [];
  pushed = [];
  const linked = await makeUser("a@x.mn");
  const expired = await makeUser("b@x.mn");
  await makeUser("c@x.mn"); // has access, never linked Telegram
  await db.execute(sql`UPDATE users SET access_until = '2027-01-01', telegram_chat_id = '111' WHERE id = ${linked.id}`);
  await db.execute(sql`UPDATE users SET access_until = '2020-01-01', telegram_chat_id = '222' WHERE id = ${expired.id}`);
  await db.execute(sql`UPDATE users SET access_until = '2027-01-01' WHERE email = 'c@x.mn'`);
  const admin = await makeUser("adm@x.mn", "ADMIN");
  await db.execute(sql`UPDATE users SET telegram_chat_id = '999' WHERE id = ${admin.id}`);
});

test("the message says what to do, where, how much is at risk, and how the rule has done", () => {
  const text = signalText(setup(), new Date(now.getTime() - 15 * 6e4), now, undefined, "https://xau.example");
  for (const part of ["BUY · АВАХ", "XAUUSD", "<b>Азийн хүрээний breakout</b>", "4006.00", "4000.00", "4018.00", "0.01 lot: эрсдэл $6.00, ашиг $12.00", "R:R 1 : 2.0", "Trend breakout-тай нэг чиглэлд", "152", "34.1%", "16:45 (УБ)", "15 минут", '<a href="https://xau.example/setup">', "зөвлөгөө биш"]) expect(text).toContain(part);
  expect(signalText(setup({ side: "SELL", entry: 3994, stop: 4000, target: 3982 }), null, now)).toContain("SELL · ЗАРАХ");
  expect(signalText(setup({ history: { n: 4, winPct: null, avgR: null, profitFactor: null } }), null, now)).toContain("дата хангалтгүй");
  // no site address known: no link, nothing broken
  expect(signalText(setup(), null, now, undefined, null)).not.toContain("<a ");
});
test("text from a setup is escaped for Telegram's HTML", () => {
  const text = signalText(setup({ name: "A <b> & B", checks: [{ label: "RSI < 30", ok: true }] }), null, now);
  expect(text).toContain("A &lt;b&gt; &amp; B");
  expect(text).toContain("RSI &lt; 30");
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
  expect(await emitSignals(now, { view: view([setup({ status: "WATCH" })]), send })).toBe(0);
  expect(sent).toHaveLength(0);
});
test("the Asian breakout signals once a day, and again the next day", async () => {
  expect(await emitSignals(now, { view: view([setup()]), send })).toBe(1);
  expect(await emitSignals(new Date(now.getTime() + 3 * 36e5), { view: view([setup()]), send })).toBe(0);
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
  expect(await emitSignals(now, { view: view([setup()]), send })).toBe(1);
  expect(sent).toHaveLength(0); // recorded, but nobody wanted it
});
test("each user gets the message in their own language", async () => {
  await db.execute(sql`UPDATE users SET locale = 'en', time_zone = 'Europe/London' WHERE telegram_chat_id = '999'`);
  const english = setup({ name: "Asian range breakout", checks: [{ label: "Asian range complete (07:00 London)", ok: true }] });
  const asked: string[] = [];
  const viewFor = async (v: { locale: string; timeZone: string }) => { asked.push(`${v.locale} ${v.timeZone}`); return view([english]); };
  expect(await emitSignals(now, { view: view([setup()]), viewFor, send })).toBe(1);
  expect(asked).toEqual(["en Europe/London"]); // the default reading is reused for everyone else
  const byChat = Object.fromEntries(sent.map((s) => [s.chatId, s.text]));
  expect(byChat["111"]).toContain("Азийн хүрээ бүрдсэн (15:00 УБ)");
  for (const part of ["🟢 <b>BUY</b> XAUUSD", "Asian range breakout", "Entry: around <b>4006.00</b>", "0.01 lot: risk $6.00, reward $12.00", "Asian range complete (07:00 London)", "152 trades, 34.1% profitable", "08:45 (London) candle, 15 minutes ago", "not financial advice"]) expect(byChat["999"]).toContain(part);
  expect(byChat["999"]).not.toMatch(/[Ѐ-ӿ]/);
});

test("a setup that went active too long ago (the job was down) is recorded, marked not sent, and left out of the list", async () => {
  const late = setup({ at: new Date(now.getTime() - 3 * 36e5) });
  expect(await emitSignals(now, { view: view([late]), send })).toBe(1);
  expect(sent).toHaveLength(0);
  expect(await listSignals(10)).toHaveLength(0);
  const [row] = await listSignals(10, undefined, { includeUnsent: true });
  expect(row).toMatchObject({ sentTo: NOT_SENT, createdAt: late.at });
});
test("Telegram and the robot share one freshness rule: 30 minutes after the bar closed", async () => {
  expect(ENTRY_FRESH_MS).toBe(30 * 6e4);
  expect(await emitSignals(now, { view: view([setup({ at: new Date(now.getTime() - 31 * 6e4) })]), send })).toBe(1);
  expect(sent).toHaveLength(0);
});
test("the message shows when the triggering bar closed, not the latest candle", async () => {
  await emitSignals(now, { view: view([setup({ at: new Date(now.getTime() - 25 * 6e4) })]), send });
  expect(sent[0].text).toContain("25 минутын өмнө");
});
test("a reading of today that went active and already ended between runs is recorded, not sent, never lost", async () => {
  const ended = setup({ status: "OFF", result: 3, at: new Date(now.getTime() - 50 * 6e4) });
  expect(await emitSignals(now, { view: view([ended]), send })).toBe(1);
  expect(sent).toHaveLength(0);
  expect(await listSignals(10, undefined, { includeUnsent: true })).toMatchObject([{ setupId: "asian-breakout", sentTo: NOT_SENT }]);
  // yesterday's ended reading, or one with no levels, records nothing
  expect(await emitSignals(now, { view: view([setup({ id: "ny-open-breakout", status: "OFF", at: new Date(now.getTime() - 30 * 36e5) }), setup({ id: "ny-late-breakout", status: "OFF", entry: null, at: now })]), send })).toBe(0);
});
test("two accounts on one chat get one message", async () => {
  await db.execute(sql`UPDATE users SET telegram_chat_id = '111' WHERE telegram_chat_id = '999'`);
  expect(await emitSignals(now, { view: view([setup()]), send })).toBe(1);
  expect(sent.map((s) => s.chatId)).toEqual(["111"]);
});
test("when Telegram fails for everyone the signal is dropped and the next run tries again", async () => {
  const down = async () => { throw new Error("502 Bad Gateway"); };
  expect(await emitSignals(now, { view: view([setup()]), send: down })).toBe(0);
  expect(await listSignals(10)).toHaveLength(0);
  expect(await emitSignals(new Date(now.getTime() + 5 * 6e4), { view: view([setup()]), send })).toBe(1);
  expect(sent).toHaveLength(2);
});
test("a chat that blocked the bot does not count as sent", async () => {
  const blocked = async (chatId: string, text: string) => (chatId === "111" ? false : send(chatId, text));
  await emitSignals(now, { view: view([setup()]), send: blocked });
  expect((await listSignals(10))[0].sentTo).toBe(1);
});

describe("push notifications", () => {
  test("a signal also goes by push to subscribed users with access, with or without Telegram", async () => {
    await subscribe("c@x.mn"); // access, no Telegram
    await subscribe("b@x.mn"); // Telegram linked but access expired
    expect(await emitSignals(now, { view: view([setup()]), send, push })).toBe(1);
    expect(pushed.map((p) => p.userId)).toEqual([await idOf("c@x.mn")]);
    const m = pushed[0].msg;
    expect(m.title).toContain("BUY");
    expect(m.title).toContain("Азийн хүрээний breakout");
    for (const part of ["4006.00", "4000.00", "4018.00"]) expect(m.body).toContain(part);
    expect(m.body).not.toMatch(/<[a-z]/);
    expect(m.url).toBe("/setup");
  });
  test("muted or paused signals are not pushed either", async () => {
    await subscribe("c@x.mn");
    await db.execute(sql`UPDATE users SET signals_muted = 'asian-breakout' WHERE email = 'c@x.mn'`);
    await emitSignals(now, { view: view([setup()]), send, push });
    expect(pushed).toHaveLength(0);
  });
  test("a signal that reached someone by push counts as sent even if Telegram failed for everyone", async () => {
    await subscribe("c@x.mn");
    expect(await emitSignals(now, { view: view([setup()]), send: async () => { throw new Error("down"); }, push })).toBe(1);
    expect((await listSignals(5)).length).toBe(1);
  });
  test("the news heads-up is pushed to subscribed users who asked for it", async () => {
    await subscribe("c@x.mn");
    await database.insert(schema.economicEvents).values({ type: "NFP", title: "Ажил эрхлэлтийн тайлан (NFP)", country: "АНУ", impact: "HIGH", time: new Date(now.getTime() + 20 * 6e4), source: "test" });
    await subscribe("a@x.mn"); // subscribed but never asked for news
    await db.execute(sql`UPDATE users SET signals_news = true WHERE email = 'c@x.mn'`);
    expect(await emitNewsAlerts(now, { send, push })).toBe(1);
    expect(pushed).toHaveLength(1);
    expect(pushed[0].msg.title).toContain("20 минутын дараа");
    expect(pushed[0].msg.body).toContain("Ажил эрхлэлтийн тайлан (NFP)");
    expect(pushed[0].msg.url).toBe("/news");
  });
});

describe("news heads-up", () => {
  const release = (minutes: number, type = "NFP", title = "Ажил эрхлэлтийн тайлан (NFP)", impact: "HIGH" | "MEDIUM" = "HIGH") =>
    database.insert(schema.economicEvents).values({ type, title, country: "АНУ", impact, time: new Date(now.getTime() + minutes * 6e4), source: "test" });
  beforeEach(async () => {
    await db.execute(sql`UPDATE users SET signals_news = true WHERE telegram_chat_id IN ('111', '222')`); // 999 did not opt in, 222 has no access
  });

  test("goes once, to linked users who opted in and have access, with releases at the same time together", async () => {
    await release(25);
    await release(25, "UNEMP", "Unemployment rate");
    await release(25, "RETAIL", "Жижиглэн худалдаа", "MEDIUM"); // not HIGH
    await release(90, "CPI", "Хэрэглээний үнийн индекс (CPI)"); // too far off
    expect(await emitNewsAlerts(now, { send })).toBe(2);
    expect(sent.map((s) => s.chatId)).toEqual(["111"]);
    for (const part of ["25 минутын дараа", "17:25 (УБ)", "Ажил эрхлэлтийн тайлан (NFP)", "Unemployment rate", "зөвлөгөө биш"]) expect(sent[0].text).toContain(part);
    expect(sent[0].text).not.toContain("Жижиглэн");
    expect(await emitNewsAlerts(new Date(now.getTime() + 5 * 6e4), { send })).toBe(0);
    expect(sent).toHaveLength(1);
  });
  test("a paused user hears nothing", async () => {
    await db.execute(sql`UPDATE users SET signals_paused = true WHERE telegram_chat_id = '111'`);
    await release(20);
    await emitNewsAlerts(now, { send });
    expect(sent).toHaveLength(0);
  });
  test("when Telegram fails for everyone, the next run tries again", async () => {
    await release(20);
    expect(await emitNewsAlerts(now, { send: async () => { throw new Error("down"); } })).toBe(0);
    expect(await emitNewsAlerts(new Date(now.getTime() + 5 * 6e4), { send })).toBe(1);
    expect(sent).toHaveLength(1);
  });
  test("in English on the user's clock", () => {
    const text = newsText([{ time: new Date(now.getTime() + 30 * 6e4), type: "NFP", title: "Ажил эрхлэлтийн тайлан (NFP)" }], now, viewer({ locale: "en", timeZone: "Europe/London" }));
    for (const part of ["Important release in 30 minutes", "09:30 (London)", "Jobs report (NFP)", "not financial advice"]) expect(text).toContain(part);
    expect(text).not.toMatch(/[Ѐ-ӿ]/);
  });
});
