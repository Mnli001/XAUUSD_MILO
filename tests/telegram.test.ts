import { sql } from "drizzle-orm";
import { vi } from "vitest";
import { db } from "@/lib/db";
import { findUserById } from "@/lib/users";
import { handleUpdate, newLinkCode, unlinkTelegram, webhookSecret, telegramConfigured } from "@/lib/telegram";
import { POST } from "@/app/api/telegram/webhook/route";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

let calls: { url: string; body: Record<string, unknown> }[];
beforeEach(async () => {
  await resetDb();
  calls = [];
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:test");
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const start = (text: string, chatId = 555) => ({ message: { chat: { id: chatId }, text } });

test("it is only configured when the token is set", () => {
  expect(telegramConfigured()).toBe(true);
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
  expect(telegramConfigured()).toBe(false);
});
test("pressing Start with the user's code links that chat to that user, once", async () => {
  const u = await makeUser("a@x.mn");
  const code = await newLinkCode(u.id);
  expect(code).toMatch(/^[a-f0-9]{24}$/);
  await handleUpdate(start(`/start ${code}`));
  expect(await findUserById(u.id)).toMatchObject({ telegramChatId: "555", telegramLinkCode: null });
  expect(calls.at(-1)).toMatchObject({ url: expect.stringContaining("/bot123:test/sendMessage"), body: { chat_id: "555" } });
  // the code cannot be reused by another chat
  await handleUpdate(start(`/start ${code}`, 777));
  expect((await findUserById(u.id))!.telegramChatId).toBe("555");
});
test("a wrong or missing code links nothing and says how to link", async () => {
  const u = await makeUser("a@x.mn");
  await newLinkCode(u.id);
  await handleUpdate(start("/start nope"));
  await handleUpdate(start("hello"));
  await handleUpdate({});
  expect((await findUserById(u.id))!.telegramChatId).toBeNull();
  expect(calls.filter((c) => c.url.includes("sendMessage"))).toHaveLength(2);
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
