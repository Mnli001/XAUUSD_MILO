import { sql } from "drizzle-orm";
import { vi } from "vitest";
import { db, schema } from "@/lib/db";
import { findUserById } from "@/lib/users";
import { confirmPendingTelegram, pendingTelegram, rejectPendingTelegram, PENDING_TTL_MS, deliver, esc, handleUpdate, LINK_CODE_TTL_MS, newLinkCode, sendMessage, TelegramError, telegramTiming, unlinkTelegram, webhookSecret, telegramConfigured } from "@/lib/telegram";
import { POST } from "@/app/api/telegram/webhook/route";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

type Reply = { status: number; body: Record<string, unknown> } | "network";
let calls: { url: string; body: Record<string, unknown> }[];
let replies: Reply[]; // scripted answers, used up in order; after that every call succeeds
let waits: number[];
const realSleep = telegramTiming.sleep;
beforeEach(async () => {
  await resetDb();
  calls = [];
  replies = [];
  waits = [];
  telegramTiming.sleep = async (ms) => { waits.push(ms); };
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:test");
  vi.stubEnv("APP_URL", "https://xau.example");
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    const r = replies.shift() ?? { status: 200, body: { ok: true, result: {} } };
    if (r === "network") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
});
afterEach(() => { telegramTiming.sleep = realSleep; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const start = (text: string, chatId = 555, type = "private") => ({ message: { chat: { id: chatId, type }, text } });
const sends = () => calls.filter((c) => c.url.includes("sendMessage"));
const lastText = () => String(sends().at(-1)?.body.text ?? "");
const linkUser = (id: string, chat: string) => db.execute(sql`UPDATE users SET telegram_chat_id = ${chat}, access_until = '2099-01-01' WHERE id = ${id}`);

test("it is only configured when the token is set", () => {
  expect(telegramConfigured()).toBe(true);
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
  expect(telegramConfigured()).toBe(false);
});
test("with no token nothing is sent and nothing counts as sent", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
  expect(await sendMessage("1", "hi")).toBe(false);
  expect(calls).toHaveLength(0);
});
test("pressing Start with the user's code links that chat to that user, once", async () => {
  const u = await makeUser("a@x.mn");
  const code = await newLinkCode(u.id);
  expect(code).toMatch(/^[a-f0-9]{24}$/);
  await handleUpdate(start(`/start ${code}`));
  expect(await findUserById(u.id)).toMatchObject({ telegramChatId: "555", telegramLinkCode: null, telegramLinkExpiresAt: null });
  expect(sends().at(-1)).toMatchObject({ url: expect.stringContaining("/bot123:test/sendMessage"), body: { chat_id: "555", parse_mode: "HTML" } });
  expect(lastText()).toContain("Холбогдлоо, a.");
  expect(lastText()).toContain("/status");
  // the code cannot be reused by another chat
  await handleUpdate(start(`/start ${code}`, 777));
  expect((await findUserById(u.id))!.telegramChatId).toBe("555");
});
test("a link code stops working after 30 minutes and is then cleared", async () => {
  const u = await makeUser("a@x.mn");
  const made = new Date(Date.now() - LINK_CODE_TTL_MS - 6e4);
  const code = await newLinkCode(u.id, made);
  await handleUpdate(start(`/start ${code}`));
  expect(await findUserById(u.id)).toMatchObject({ telegramChatId: null, telegramLinkCode: null });
  expect(lastText()).toContain("хугацаа");
});
test("a chat links to one account: linking it to a second account takes it from the first", async () => {
  const a = await makeUser("a@x.mn");
  const b = await makeUser("b@x.mn");
  await linkUser(a.id, "555");
  await handleUpdate(start(`/start ${await newLinkCode(b.id)}`));
  expect((await findUserById(a.id))!.telegramChatId).toBeNull();
  expect((await findUserById(b.id))!.telegramChatId).toBe("555");
});
test("a wrong or missing code links nothing and says how to link", async () => {
  const u = await makeUser("a@x.mn");
  await newLinkCode(u.id);
  await handleUpdate(start("/start nope"));
  await handleUpdate(start("hello"));
  await handleUpdate({});
  expect((await findUserById(u.id))!.telegramChatId).toBeNull();
  expect(sends()).toHaveLength(2);
});
test("group chats are ignored, codes included", async () => {
  const u = await makeUser("a@x.mn");
  await handleUpdate(start(`/start ${await newLinkCode(u.id)}`, -100, "group"));
  await handleUpdate(start("/status", -100, "supergroup"));
  expect((await findUserById(u.id))!.telegramChatId).toBeNull();
  expect(calls).toHaveLength(0);
});
test("a user's name is escaped for HTML", async () => {
  const [u] = await db.insert(schema.users).values({ email: "h@x.mn", name: "<b>Bat & Co</b>", passwordHash: "x" }).returning();
  await handleUpdate(start(`/start ${await newLinkCode(u.id)}`));
  expect(lastText()).toContain("&lt;b&gt;Bat &amp; Co&lt;/b&gt;");
  expect(esc(`a"<>&`)).toBe("a&quot;&lt;&gt;&amp;");
});
test("/stop pauses signals, /resume turns them back on, anything else gets the help", async () => {
  const u = await makeUser("a@x.mn");
  await linkUser(u.id, "555");
  await handleUpdate(start("/stop"));
  expect((await findUserById(u.id))!.signalsPaused).toBe(true);
  expect(lastText()).toContain("/resume");
  await handleUpdate(start("/resume"));
  expect((await findUserById(u.id))!.signalsPaused).toBe(false);
  await handleUpdate(start("hi"));
  expect(lastText()).toContain("/status");
});
test("/status gives the bias, the next important release on the user's clock, and a Setup link", async () => {
  const u = await makeUser("a@x.mn");
  await linkUser(u.id, "555");
  await db.execute(sql`UPDATE users SET locale = 'en', time_zone = 'Europe/London' WHERE id = ${u.id}`);
  const at = new Date(Date.now() + 3 * 36e5);
  await db.insert(schema.economicEvents).values({ type: "NFP", title: "Ажил эрхлэлтийн тайлан (NFP)", country: "АНУ", impact: "HIGH", time: at, source: "test" });
  await db.insert(schema.biasSnapshots).values({ symbol: "XAUUSD", total: 34, buyerPct: 67, label: "ӨСӨХ хандлага", perTimeframe: {}, hourly: [] });
  await handleUpdate(start("/status"));
  const text = lastText();
  for (const part of ["BULLISH bias", "+34", "Jobs report (NFP)", "London", "Signals: on", 'href="https://xau.example/setup"', "not financial advice"]) expect(text).toContain(part);
  expect(text).not.toMatch(/[Ѐ-ӿ]/);
});
test("/status tells an expired user their plan ended and where to renew it", async () => {
  const u = await makeUser("a@x.mn");
  await db.execute(sql`UPDATE users SET telegram_chat_id = '555', access_until = '2020-01-01' WHERE id = ${u.id}`);
  await handleUpdate(start("/status"));
  expect(lastText()).toContain("багцын хугацаа дууссан");
  expect(lastText()).toContain("“Багц”");
});
test("/status tells someone who never had a plan how to get one, not that it ended", async () => {
  const u = await makeUser("a@x.mn");
  await db.execute(sql`UPDATE users SET telegram_chat_id = '555' WHERE id = ${u.id}`);
  await handleUpdate(start("/status"));
  expect(lastText()).toContain("идэвхтэй багц алга");
  expect(lastText()).not.toContain("дууссан");
});
test("a 429 waits as long as Telegram asks, then sends", async () => {
  replies = [{ status: 429, body: { ok: false, error_code: 429, description: "Too Many Requests: retry after 3", parameters: { retry_after: 3 } } }];
  expect(await sendMessage("1", "hi")).toBe(true);
  expect(waits).toEqual([3000]);
  expect(sends()).toHaveLength(2);
});
test("network errors and 5xx are retried; a 400 is not", async () => {
  replies = ["network", { status: 502, body: { ok: false, error_code: 502, description: "Bad Gateway" } }];
  expect(await sendMessage("1", "hi")).toBe(true);
  expect(sends()).toHaveLength(3);
  replies = [{ status: 400, body: { ok: false, error_code: 400, description: "Bad Request: message is too long" } }];
  await expect(sendMessage("1", "hi")).rejects.toBeInstanceOf(TelegramError);
  expect(sends()).toHaveLength(4);
});
test("a 429 asking for a long wait is given up on rather than holding the job", async () => {
  replies = [{ status: 429, body: { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 600 } } }];
  await expect(sendMessage("1", "hi")).rejects.toMatchObject({ code: 429 });
  expect(waits).toEqual([]);
});
test("markup Telegram cannot parse goes again as plain text", async () => {
  replies = [{ status: 400, body: { ok: false, error_code: 400, description: "Bad Request: can't parse entities" } }];
  expect(await sendMessage("1", "<b>4006 &amp; up</b>")).toBe(true);
  expect(sends()[1].body).toMatchObject({ text: "4006 & up" });
  expect(sends()[1].body.parse_mode).toBeUndefined();
});
test("a chat that blocked the bot is unlinked instead of failing on every signal", async () => {
  const u = await makeUser("a@x.mn");
  await linkUser(u.id, "555");
  replies = [{ status: 403, body: { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" } }];
  expect(await deliver("555", "hi")).toBe(false);
  expect((await findUserById(u.id))!.telegramChatId).toBeNull();
});
test("blocking the bot (my_chat_member: kicked) unlinks the chat", async () => {
  const u = await makeUser("a@x.mn");
  await linkUser(u.id, "555");
  await handleUpdate({ my_chat_member: { chat: { id: 555, type: "private" }, new_chat_member: { status: "kicked" } } });
  expect((await findUserById(u.id))!.telegramChatId).toBeNull();
  expect(calls).toHaveLength(0);
});
test("unlinking forgets the chat", async () => {
  const u = await makeUser("a@x.mn");
  await db.execute(sql`UPDATE users SET telegram_chat_id = '5' WHERE id = ${u.id}`);
  await unlinkTelegram(u.id);
  expect((await findUserById(u.id))!.telegramChatId).toBeNull();
});
test("the webhook only accepts calls that carry Telegram's secret header", async () => {
  const u = await makeUser("a@x.mn");
  const code = await newLinkCode(u.id);
  const call = (headers: Record<string, string>) => POST(new Request("http://x/api/telegram/webhook", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(start(`/start ${code}`)) }));
  expect((await call({})).status).toBe(401);
  expect((await call({ "x-telegram-bot-api-secret-token": "wrong" })).status).toBe(401);
  expect((await findUserById(u.id))!.telegramChatId).toBeNull();
  expect((await call({ "x-telegram-bot-api-secret-token": webhookSecret() })).status).toBe(200);
  expect((await findUserById(u.id))!.telegramChatId).toBe("555");
});
test("the webhook answers 200 to a body it cannot read, so Telegram does not retry it for hours", async () => {
  const res = await POST(new Request("http://x/api/telegram/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": webhookSecret() }, body: "not json" }));
  expect(res.status).toBe(200);
});

// Linking by email: the bot asks for the address, the account's owner confirms on the site.
const from = { first_name: "Бат", username: "bat_trader" };
const say = (text: string, chatId = 555) => ({ message: { chat: { id: chatId, type: "private" }, text, from } });

test("an unknown chat is asked for the email it registered with", async () => {
  await handleUpdate(say("/start"));
  expect(lastText()).toContain("имэйл");
  expect(lastText()).toContain("email address");
});
test("an email from a chat does not link it: the account is shown a request and must say yes", async () => {
  const u = await makeUser("a@x.mn");
  await db.execute(sql`UPDATE users SET access_until = '2099-01-01' WHERE id = ${u.id}`);
  const now = new Date("2026-11-24T10:00:00Z");
  await handleUpdate(say("  A@X.mn "), now);
  let row = (await findUserById(u.id))!;
  expect(row.telegramChatId).toBeNull(); // knowing the address is not enough
  expect(row).toMatchObject({ telegramPendingChatId: "555", telegramPendingName: "Бат · @bat_trader" });
  expect(pendingTelegram(row, now)).toEqual({ name: "Бат · @bat_trader" });
  expect(lastText()).toContain("https://xau.example/settings");

  expect(await confirmPendingTelegram(u.id, new Date(now.getTime() + 60_000))).toBe(true);
  row = (await findUserById(u.id))!;
  expect(row).toMatchObject({ telegramChatId: "555", telegramPendingChatId: null, telegramPendingName: null, telegramPendingExpiresAt: null });
  expect(lastText()).toContain("Холбогдлоо, a.");
  expect(lastText()).toContain("2099-01-01"); // the bot says the subscription was recognised
  expect(sends().at(-1)!.body.chat_id).toBe("555");
});
test("the bot answers the same whether or not the email is registered", async () => {
  await makeUser("a@x.mn");
  await handleUpdate(say("a@x.mn", 1));
  const known = lastText();
  await handleUpdate(say("nobody@x.mn", 2));
  expect(lastText()).toBe(known);
});
test("a request lapses after 30 minutes and a declined one is dropped", async () => {
  const u = await makeUser("a@x.mn");
  const now = new Date("2026-11-24T10:00:00Z");
  await handleUpdate(say("a@x.mn"), now);
  const late = new Date(now.getTime() + PENDING_TTL_MS + 1);
  expect(pendingTelegram((await findUserById(u.id))!, late)).toBeNull();
  expect(await confirmPendingTelegram(u.id, late)).toBe(false);
  expect((await findUserById(u.id))!).toMatchObject({ telegramChatId: null, telegramPendingChatId: null });

  await handleUpdate(say("a@x.mn"), now);
  await rejectPendingTelegram(u.id);
  expect(await confirmPendingTelegram(u.id, now)).toBe(false);
  expect((await findUserById(u.id))!.telegramChatId).toBeNull();
});
test("confirming moves the chat from any other account and spends its other requests", async () => {
  const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn"), c = await makeUser("c@x.mn");
  await linkUser(b.id, "555");
  const now = new Date("2026-11-24T10:00:00Z");
  await handleUpdate(say("c@x.mn", 777), now); // an unlinked chat asks for two accounts
  await handleUpdate(say("a@x.mn", 777), now);
  await db.execute(sql`UPDATE users SET telegram_pending_chat_id = '555', telegram_pending_expires_at = '2099-01-01' WHERE id = ${a.id}`);
  await db.execute(sql`UPDATE users SET telegram_pending_chat_id = '555', telegram_pending_expires_at = '2099-01-01' WHERE id = ${c.id}`);
  expect(await confirmPendingTelegram(a.id, now)).toBe(true);
  expect((await findUserById(a.id))!.telegramChatId).toBe("555");
  expect((await findUserById(b.id))!.telegramChatId).toBeNull(); // one chat, one account
  expect((await findUserById(c.id))!.telegramPendingChatId).toBeNull();
});
test("a linked chat that sends an email is not asked to link again", async () => {
  const u = await makeUser("a@x.mn");
  await linkUser(u.id, "555");
  await handleUpdate(say("other@x.mn"));
  expect((await findUserById(u.id))!.telegramPendingChatId).toBeNull();
  expect(lastText()).toContain("/status"); // the help text
});
test("/sample answers anyone with a plan, and tells someone without one how to get it", async () => {
  const u = await makeUser("a@x.mn");
  await linkUser(u.id, "555");
  await handleUpdate(start("/sample"));
  expect(lastText()).toContain("Жишээ гаргах үнийн дата одоогоор алга"); // no candles stored in this test
  await db.execute(sql`UPDATE users SET access_until = '2020-01-01' WHERE id = ${u.id}`);
  await handleUpdate(start("/sample"));
  expect(lastText()).toContain("хугацаа дууссан");
});
