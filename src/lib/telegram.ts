import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { translator } from "./i18n";
import { parseLocale } from "./prefs";

const token = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
export const telegramConfigured = () => token().length > 0;

/** Telegram echoes this back in a header on every webhook call, so nobody else can post updates. */
export const webhookSecret = () => createHash("sha256").update(`telegram:${process.env.AUTH_SECRET ?? ""}:${token()}`).digest("hex").slice(0, 40);

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (!telegramConfigured()) return null;
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!res.ok || !json?.ok) throw new Error(`Telegram ${method}: ${json?.description ?? res.status}`);
  return json.result ?? null;
}

export async function sendMessage(chatId: string, text: string): Promise<boolean> {
  await call("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
  return true;
}

let username: string | null = null;
export async function botUsername(): Promise<string | null> {
  if (username) return username;
  const me = await call<{ username?: string }>("getMe", {});
  username = me?.username ?? null;
  return username;
}

/** Points Telegram at this site. Safe to call every time someone starts linking. */
export async function ensureWebhook(origin: string): Promise<void> {
  await call("setWebhook", { url: `${origin}/api/telegram/webhook`, secret_token: webhookSecret(), allowed_updates: ["message"] });
}

/** A fresh one-time code; the user sends it to the bot by pressing Start on a t.me link. */
export async function newLinkCode(userId: string): Promise<string> {
  const code = randomBytes(12).toString("hex");
  await db.update(schema.users).set({ telegramLinkCode: code }).where(eq(schema.users.id, userId));
  return code;
}

export async function unlinkTelegram(userId: string): Promise<void> {
  await db.update(schema.users).set({ telegramChatId: null, telegramLinkCode: null }).where(eq(schema.users.id, userId));
}

const HOW_TO_LINK = {
  mn: "Холбохын тулд XAU Analytics сайтын Тохиргоо хуудсан дээрх “Telegram холбох” товчийг дарж, нээгдсэн холбоосоор энд орж Start дарна уу.",
  en: "To link, press “Link Telegram” on the Settings page of the XAU Analytics site, follow the link it opens to here and press Start.",
};

type Update = { message?: { chat?: { id?: number | string }; text?: string } };

/** One update from Telegram. "/start <code>" links the chat to the user holding that code. */
export async function handleUpdate(update: Update): Promise<void> {
  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim() ?? "";
  if (chatId === undefined || chatId === null) return;
  const chat = String(chatId);
  const code = /^\/start\s+([a-f0-9]{24})$/.exec(text)?.[1];
  if (code) {
    const [user] = await db.update(schema.users).set({ telegramChatId: chat, telegramLinkCode: null }).where(eq(schema.users.telegramLinkCode, code)).returning({ name: schema.users.name, locale: schema.users.locale });
    if (user) {
      const t = translator(parseLocale(user.locale));
      await sendMessage(chat, t(`Холбогдлоо, ${user.name}. Setup идэвхжих бүрд орох, stop, target-тай мессеж энд ирнэ.\n\nЭдгээр нь түүхэн статистик дээр суурилсан дохио, санхүүгийн зөвлөгөө биш.`, `Linked, ${user.name}. Each time a setup becomes active, a message with the entry, stop and target arrives here.\n\nThese are signals based on historical statistics, not financial advice.`));
      return;
    }
  }
  // Nobody is known for this chat yet, so the hint goes out in both languages.
  await sendMessage(chat, `${HOW_TO_LINK.mn}\n\n${HOW_TO_LINK.en}`);
}
