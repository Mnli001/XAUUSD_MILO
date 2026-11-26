import "./i18n.server";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lte, ne, or } from "drizzle-orm";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { translator, type T } from "./i18n";
import { hasAccess } from "./access";
import { prefsOf } from "./prefsDb";
import { parseLocale } from "./prefs";
import { viewer, type Viewer } from "./viewer";
import { getNextHighEvent } from "./events";
import { getTodaySnapshot } from "./snapshot";
import { SYMBOL } from "./ingest/prices";
import { biasLabelText } from "./analysis/bias";
import { eventTitle } from "./data/calendarProvider";
import { LIMITS, hit } from "./rateLimit";

const token = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
export const telegramConfigured = () => token().length > 0;

/** Telegram echoes this back in a header on every webhook call, so nobody else can post updates. */
export const webhookSecret = () => createHash("sha256").update(`telegram:${process.env.AUTH_SECRET ?? ""}:${token()}`).digest("hex").slice(0, 40);

/**
 * The site's public address, for the webhook and for links in messages. APP_URL wins; Railway sets
 * RAILWAY_PUBLIC_DOMAIN by itself. Null when neither is known.
 */
export function siteUrl(): string | null {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  return railway ? `https://${railway.replace(/\/+$/, "")}` : null;
}

/** Text for Telegram's HTML parse mode: only &, < and > (and " inside attributes) need escaping. */
export const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** What a failed Bot API call said. `code` is Telegram's error_code (0 for a network failure). */
export class TelegramError extends Error {
  constructor(readonly method: string, readonly code: number, readonly description: string, readonly retryAfter?: number) {
    super(`Telegram ${method}: ${code} ${description}`);
    this.name = "TelegramError";
  }
}

/** The chat can no longer be written to: the user blocked the bot, deleted their account, or the chat is gone. */
export const isChatGone = (e: unknown): boolean =>
  e instanceof TelegramError && (e.code === 403 || (e.code === 400 && /chat not found|user is deactivated|bot was (blocked|kicked)/i.test(e.description)));

/** Waiting is swapped out in tests. */
export const telegramTiming = {
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  maxRetryAfterMs: 30_000, // a 429 asking for longer than this is given up on; the next 5-minute run tries again
  attempts: 3,
};

type ApiReply<T> = { ok?: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };

/** One Bot API call. Retries network errors, 5xx and 429 (waiting as long as Telegram asks); other errors throw at once. */
async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (!telegramConfigured()) return null;
  for (let attempt = 1; ; attempt++) {
    let err: TelegramError;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
      const json = (await res.json().catch(() => null)) as ApiReply<T> | null;
      if (res.ok && json?.ok) return json.result ?? null;
      err = new TelegramError(method, json?.error_code ?? res.status, json?.description ?? res.statusText, json?.parameters?.retry_after);
    } catch (e) {
      // never put the request URL in the message: it carries the token
      err = new TelegramError(method, 0, e instanceof Error ? e.name : "network error");
    }
    const retryable = err.code === 0 || err.code === 429 || err.code >= 500;
    if (!retryable || attempt >= telegramTiming.attempts) throw err;
    const wait = err.code === 429 ? (err.retryAfter ?? 1) * 1000 : 1000 * attempt;
    if (wait > telegramTiming.maxRetryAfterMs) throw err;
    await telegramTiming.sleep(wait);
  }
}

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, "").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&amp;", "&");

/**
 * Sends HTML (Telegram's subset). Returns false when no bot is configured. If Telegram cannot parse
 * the markup, the same words go again as plain text rather than not at all.
 */
export async function sendMessage(chatId: string, html: string): Promise<boolean> {
  if (!telegramConfigured()) return false;
  try {
    await call("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  } catch (e) {
    if (!(e instanceof TelegramError && e.code === 400 && /parse entities/i.test(e.description))) throw e;
    await call("sendMessage", { chat_id: chatId, text: stripHtml(html), link_preview_options: { is_disabled: true } });
  }
  return true;
}

/**
 * A picture with an HTML caption (at most 1024 characters). Uploaded as a file, so it needs a multipart body
 * rather than the JSON `call` sends. Retries network errors, 5xx and 429 like `call`.
 */
export async function sendPhoto(chatId: string, png: Buffer, caption: string): Promise<boolean> {
  if (!telegramConfigured()) return false;
  for (let attempt = 1; ; attempt++) {
    let err: TelegramError;
    try {
      const form = new FormData();
      form.append("chat_id", chatId);
      form.append("caption", caption.slice(0, 1024));
      form.append("parse_mode", "HTML");
      form.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "trade.png");
      const res = await fetch(`https://api.telegram.org/bot${token()}/sendPhoto`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
      const json = (await res.json().catch(() => null)) as ApiReply<unknown> | null;
      if (res.ok && json?.ok) return true;
      err = new TelegramError("sendPhoto", json?.error_code ?? res.status, json?.description ?? res.statusText, json?.parameters?.retry_after);
    } catch (e) {
      err = new TelegramError("sendPhoto", 0, e instanceof Error ? e.name : "network error");
    }
    const retryable = err.code === 0 || err.code === 429 || err.code >= 500;
    if (!retryable || attempt >= telegramTiming.attempts) throw err;
    await telegramTiming.sleep(err.code === 429 ? (err.retryAfter ?? 1) * 1000 : 1000 * attempt);
  }
}

/** sendPhoto for broadcasts, falling back to the caption as text when the picture cannot go; a blocked chat is unlinked. */
export async function deliverPhoto(chatId: string, png: Buffer | null, caption: string): Promise<boolean> {
  try {
    if (png) {
      try { return await sendPhoto(chatId, png, caption); } catch (e) { if (isChatGone(e)) throw e; console.warn("[telegram] photo failed, sending text"); }
    }
    return await sendMessage(chatId, caption);
  } catch (e) {
    if (!isChatGone(e)) throw e;
    await forgetChat(chatId);
    return false;
  }
}

/** Forgets a chat that can no longer be reached, for every account that had it. */
export async function forgetChat(chatId: string): Promise<number> {
  const rows = await db.update(schema.users).set({ telegramChatId: null }).where(eq(schema.users.telegramChatId, chatId)).returning({ id: schema.users.id });
  if (rows.length) console.warn(`[telegram] chat unreachable (blocked or deleted), unlinked ${rows.length} account(s)`);
  return rows.length;
}

/**
 * sendMessage for broadcasts: a chat that blocked the bot is unlinked and counts as not sent
 * (false) instead of failing again on every signal. Other errors are thrown to the caller.
 */
export async function deliver(chatId: string, html: string): Promise<boolean> {
  try {
    return await sendMessage(chatId, html);
  } catch (e) {
    if (!isChatGone(e)) throw e;
    await forgetChat(chatId);
    return false;
  }
}

let username: string | null = null;
export async function botUsername(): Promise<string | null> {
  if (username) return username;
  const me = await call<{ username?: string }>("getMe", {});
  username = me?.username ?? null;
  return username;
}

const COMMANDS = {
  mn: [["setup", "Одоогийн setup, нөхцөл, чарт"], ["history", "Сүүлийн дохионы үр дүн"], ["news", "Дараагийн чухал мэдээ"], ["sample", "Жишээ дохио"], ["status", "Одоогийн чиглэл, дараагийн чухал мэдээ"], ["stop", "Дохиог түр зогсоох"], ["resume", "Дохиог дахин асаах"], ["reset", "Сайтын нууц үг сэргээх"], ["help", "Тусламж"]],
  en: [["setup", "The setup now, its checks and a chart"], ["history", "How recent signals ended"], ["news", "Upcoming important releases"], ["sample", "A sample signal"], ["status", "Current bias and the next important release"], ["stop", "Pause signals"], ["resume", "Turn signals back on"], ["reset", "Reset your site password"], ["help", "Help"]],
} as const;

/** Points Telegram at this site and lists the bot's commands. Safe to call every time someone starts linking. */
export async function ensureWebhook(origin: string): Promise<void> {
  await call("setWebhook", { url: `${origin}/api/telegram/webhook`, secret_token: webhookSecret(), allowed_updates: ["message", "my_chat_member"] });
  const list = (l: keyof typeof COMMANDS) => COMMANDS[l].map(([command, description]) => ({ command, description }));
  await call("setMyCommands", { commands: list("mn") }).catch(() => undefined); // the menu is a nicety; linking does not depend on it
  await call("setMyCommands", { commands: list("en"), language_code: "en" }).catch(() => undefined);
}

export const LINK_CODE_TTL_MS = 30 * 60 * 1000;

/** A fresh one-time code, good for 30 minutes; the user sends it to the bot by pressing Start on a t.me link. */
export async function newLinkCode(userId: string, now = new Date()): Promise<string> {
  const code = randomBytes(12).toString("hex");
  await db.update(schema.users).set({ telegramLinkCode: code, telegramLinkExpiresAt: new Date(now.getTime() + LINK_CODE_TTL_MS) }).where(eq(schema.users.id, userId));
  return code;
}

export async function unlinkTelegram(userId: string): Promise<void> {
  await db.update(schema.users).set({ telegramChatId: null, telegramLinkCode: null, telegramLinkExpiresAt: null, telegramPendingChatId: null, telegramPendingName: null, telegramPendingExpiresAt: null, telegramPendingUsername: null }).where(eq(schema.users.id, userId));
}

const HOW_TO_LINK = {
  mn: "Холбохын тулд XAU Analytics-д бүртгүүлсэн имэйл хаягаа энд бичээд илгээнэ үү. Дараа нь сайтдаа нэвтрэхэд гарч ирэх хүсэлт дээр “Тийм, минийх” гэж дарна. (Эсвэл сайтын Тохиргоо хуудсан дээрх “Telegram холбох” товчийг дарж болно.)",
  en: "To link, send the email address you registered with on XAU Analytics here. Then sign in to the site and press “Yes, it's mine” on the request that appears. (Or press “Link Telegram” on the site's Settings page.)",
};
const NOT_ADVICE = (t: T) => t("Статистик, санхүүгийн зөвлөгөө биш.", "Statistics, not financial advice.");

/** "Open the Setup page" as a link, or nothing when the site's address is unknown. */
export function setupLink(t: T, base: string | null = siteUrl()): string {
  return base ? `<a href="${esc(`${base}/setup`)}">${esc(t("Setup хуудсыг нээх", "Open the Setup page"))}</a>` : "";
}

function helpText(u: User, t: T): string {
  return [
    t("<b>Командууд</b>", "<b>Commands</b>"),
    t("/setup — одоогийн setup, нөхцөл, орох/stop/target, чарт", "/setup — the setup now: checks, entry/stop/target, chart"),
    t("/history — сүүлийн 10 дохио, TP/SL үр дүн", "/history — the last 10 signals and how they ended"),
    t("/sample — жишээ дохио (зураг ба мессеж ямар харагдахыг)", "/sample — a sample signal (what the picture and message look like)"),
    t("/news — дараагийн 3 хоногийн чухал мэдээ", "/news — important releases in the next 3 days"),
    t("/status — одоогийн чиглэл, дараагийн чухал мэдээ", "/status — current bias and the next important release"),
    t("/stop — дохиог түр зогсоох", "/stop — pause signals"),
    t("/resume — дохиог дахин асаах", "/resume — turn signals back on"),
    t("/reset — сайтын нууц үгээ мартсан бол шинэчлэх холбоос", "/reset — a link to set a new site password if you forgot it"),
    "",
    u.signalsPaused ? t("Дохио одоо түр зогссон байна.", "Signals are paused right now.") : t("Setup идэвхжих бүрд дохио энд ирнэ.", "A signal arrives here each time a setup becomes active."),
  ].join("\n");
}

/** The /status reply: today's bias, the last price and the next HIGH-impact release, on the user's clock. */
export async function statusText(u: User, now: Date, v: Viewer = viewer(prefsOf(u))): Promise<string> {
  const { t } = v;
  if (!hasAccess(u, now)) {
    return esc(u.accessUntil
      ? t("Таны багцын хугацаа дууссан байна. Сайтын “Багц” хуудаснаас сунгаарай.", "Your plan has ended. Renew it on the site\u2019s “Plans” page.")
      : t("Танд идэвхтэй багц алга. Сайтын “Багц” хуудаснаас сонгоорой.", "You have no active plan. Choose one on the site\u2019s “Plans” page."));
  }
  const [snap, next] = await Promise.all([getTodaySnapshot(SYMBOL, now), getNextHighEvent(now)]);
  const lines = [t("<b>XAUUSD · одоогийн байдал</b>", "<b>XAUUSD · right now</b>")];
  if (snap.bias) {
    const score = Math.round(snap.bias.total);
    lines.push(t(`Чиглэл: <b>${esc(biasLabelText(snap.bias.label, t))}</b> (${score > 0 ? "+" : ""}${score}, авагч ${snap.bias.buyerPct}%)`, `Bias: <b>${esc(biasLabelText(snap.bias.label, t))}</b> (${score > 0 ? "+" : ""}${score}, buyers ${snap.bias.buyerPct}%)`));
  } else lines.push(t("Чиглэл: дата хараахан алга", "Bias: no data yet"));
  if (snap.price) lines.push(t(`Үнэ: ${snap.price.last.toFixed(2)} (${v.time(snap.price.updatedAt)} ${esc(v.zone)} лаа${snap.price.stale ? ", хоцорсон" : ""})`, `Price: ${snap.price.last.toFixed(2)} (${v.time(snap.price.updatedAt)} ${esc(v.zone)} candle${snap.price.stale ? ", stale" : ""})`));
  lines.push(next
    ? t(`Дараагийн чухал мэдээ: <b>${v.dateTime(next.time)}</b> (${esc(v.zone)}) · ${esc(eventTitle(next, t))}`, `Next important release: <b>${v.dateTime(next.time)}</b> (${esc(v.zone)}) · ${esc(eventTitle(next, t))}`)
    : t("Дараагийн чухал мэдээ: хуанлид алга", "Next important release: none in the calendar"));
  lines.push(u.signalsPaused ? t("Дохио: түр зогссон (/resume)", "Signals: paused (/resume)") : t("Дохио: асаалттай (/stop)", "Signals: on (/stop)"));
  const link = setupLink(t);
  return [...lines, ...(link ? [link] : []), `<i>${esc(NOT_ADVICE(t))}</i>`].join("\n");
}

type Chat = { id?: number | string; type?: string };
type Sender = { first_name?: string; last_name?: string; username?: string };
type Update = {
  message?: { chat?: Chat; text?: string; from?: Sender };
  my_chat_member?: { chat?: Chat; new_chat_member?: { status?: string } };
};

const CODE = /^\/start(?:@\w+)?\s+([a-f0-9]{24})$/;
const COMMAND = /^\/(\w+)(?:@\w+)?(?:\s|$)/;

async function linkChat(chat: string, code: string, now: Date): Promise<void> {
  const linked = await db.transaction(async (tx) => {
    const [user] = await tx.update(schema.users).set({ telegramChatId: chat, telegramLinkCode: null, telegramLinkExpiresAt: null })
      .where(and(eq(schema.users.telegramLinkCode, code), gt(schema.users.telegramLinkExpiresAt, now))).returning();
    // one chat belongs to one account, or that chat would get every signal twice
    if (user) await tx.update(schema.users).set({ telegramChatId: null }).where(and(eq(schema.users.telegramChatId, chat), ne(schema.users.id, user.id)));
    return user;
  });
  if (linked) {
    const t = translator(parseLocale(linked.locale));
    await sendMessage(chat, [
      esc(t(`Холбогдлоо, ${linked.name}. Setup идэвхжих бүрд орох, stop, target-тай мессеж энд ирнэ.`, `Linked, ${linked.name}. Each time a setup becomes active, a message with the entry, stop and target arrives here.`)),
      "",
      helpText(linked, t),
      "",
      `<i>${esc(t("Эдгээр нь түүхэн статистик дээр суурилсан дохио, санхүүгийн зөвлөгөө биш.", "These are signals based on historical statistics, not financial advice."))}</i>`,
    ].join("\n"));
    return;
  }
  // A code that has run out is cleared, so it cannot be tried later either.
  const [stale] = await db.update(schema.users).set({ telegramLinkCode: null, telegramLinkExpiresAt: null }).where(eq(schema.users.telegramLinkCode, code)).returning({ locale: schema.users.locale });
  if (stale) {
    const t = translator(parseLocale(stale.locale));
    await sendMessage(chat, esc(t("Энэ холбоосны хугацаа (30 минут) дууссан байна. Сайт дээр “Telegram холбох” товчийг дахин дарна уу.", "This link has expired (it lasts 30 minutes). Press “Link Telegram” on the site again.")));
    return;
  }
  await sendMessage(chat, esc(`${HOW_TO_LINK.mn}\n\n${HOW_TO_LINK.en}`));
}

export const PENDING_TTL_MS = 30 * 60 * 1000;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** The display name the chat chose (free text: anyone can call themselves anything, so it is never shown alone). */
function senderName(from: Sender | undefined): string | null {
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return name ? name.slice(0, 64) : null;
}

/** The chat's @username as Telegram reports it; Telegram enforces the format and uniqueness. */
function senderUsername(from: Sender | undefined): string | null {
  return from?.username && /^[A-Za-z0-9_]{4,32}$/.test(from.username) ? from.username : null;
}

/**
 * A chat gave an email address. If an account has it, that account is shown a yes/no on the site;
 * the chat is linked only when its owner says yes there. The chat is told the same thing either way,
 * so the bot cannot be used to find out which addresses are registered, and knowing somebody's
 * address is not enough to receive their signals.
 *
 * A request still open for the account is never replaced by another chat's (first come, first shown, until it
 * lapses or the owner answers), so an attacker cannot swap their chat in after the owner's; and each chat may
 * ask only a few times an hour.
 */
async function requestLinkByEmail(chat: string, email: string, from: Sender | undefined, now: Date): Promise<void> {
  if (!(await hit("tg-link", chat, LIMITS.telegramLink, now))) {
    console.warn("[telegram] email link requests rate limited for a chat");
    await sendMessage(chat, esc("Хэт олон хүсэлт илгээлээ. Нэг цагийн дараа дахин оролдоно уу.\n\nToo many requests. Try again in an hour.")); // i18n-ok: sent in both languages, the chat's owner is not known yet
    return;
  }
  const u = schema.users;
  await db.update(u)
    .set({ telegramPendingChatId: chat, telegramPendingName: senderName(from), telegramPendingUsername: senderUsername(from), telegramPendingExpiresAt: new Date(now.getTime() + PENDING_TTL_MS) })
    .where(and(
      eq(u.email, email.trim().toLowerCase()),
      isNull(u.telegramChatId), // an account already linked is not offered another chat
      or(isNull(u.telegramPendingChatId), isNull(u.telegramPendingExpiresAt), lte(u.telegramPendingExpiresAt, now), eq(u.telegramPendingChatId, chat)),
    ));
  const base = siteUrl();
  const link = (label: string) => (base ? `\n<a href="${esc(`${base}/settings`)}">${esc(label)}</a>` : "");
  await sendMessage(chat, [
    `${esc("Хэрэв энэ имэйл XAU Analytics-д бүртгэлтэй бол таны бүртгэлд баталгаажуулах хүсэлт очлоо. 30 минутын дотор сайтдаа нэвтэрч, гарч ирэх “Тийм, минийх” товчийг дарна уу. Дармагц энд мэдэгдэнэ.")}${link("Сайтыг нээх")}`, // i18n-ok: sent in both languages, the chat's owner is not known yet
    `${esc("If this email is registered on XAU Analytics, a request to confirm has gone to that account. Within 30 minutes, sign in to the site and press “Yes, it's mine” on the request that appears. You will be told here as soon as you do.")}${link("Open the site")}`,
  ].join("\n\n"));
}

export type PendingTelegram = {
  /** What to show beside the yes/no: the Telegram-verified @username and numeric chat id first, then the free-text name in quotes. */
  name: string;
  displayName: string | null;
  username: string | null;
  chatId: string;
};

/** The link request waiting for this user's yes or no, or null when there is none (or it has lapsed). */
export function pendingTelegram(u: Pick<User, "telegramPendingChatId" | "telegramPendingName" | "telegramPendingExpiresAt"> & Partial<Pick<User, "telegramPendingUsername">>, now: Date): PendingTelegram | null {
  if (!u.telegramPendingChatId || !u.telegramPendingExpiresAt || u.telegramPendingExpiresAt.getTime() <= now.getTime()) return null;
  const username = u.telegramPendingUsername ?? null;
  const displayName = u.telegramPendingName || null;
  const verified = [username ? `@${username}` : null, `ID ${u.telegramPendingChatId}`].filter(Boolean).join(" · "); // i18n-ok: handle and number, the same in both languages
  return { name: displayName ? `${verified} — “${displayName}”` : verified, displayName, username, chatId: u.telegramPendingChatId };
}

const clearPending = { telegramPendingChatId: null, telegramPendingName: null, telegramPendingExpiresAt: null, telegramPendingUsername: null };

/** The account's owner said yes on the site: the waiting chat becomes theirs. False when nothing was waiting. */
export async function confirmPendingTelegram(userId: string, now = new Date()): Promise<boolean> {
  const linked = await db.transaction(async (tx) => {
    const [u] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!u || !pendingTelegram(u, now)) {
      if (u?.telegramPendingChatId) await tx.update(schema.users).set(clearPending).where(eq(schema.users.id, userId));
      return null;
    }
    const chat = u.telegramPendingChatId!;
    // one chat belongs to one account, or that chat would get every signal twice
    await tx.update(schema.users).set({ telegramChatId: null }).where(and(eq(schema.users.telegramChatId, chat), ne(schema.users.id, userId)));
    // the same chat may have asked for other addresses too; those requests are spent
    await tx.update(schema.users).set(clearPending).where(and(eq(schema.users.telegramPendingChatId, chat), ne(schema.users.id, userId)));
    const [done] = await tx.update(schema.users).set({ telegramChatId: chat, telegramLinkCode: null, telegramLinkExpiresAt: null, ...clearPending }).where(eq(schema.users.id, userId)).returning();
    return done;
  });
  if (!linked) return false;
  const v = viewer(prefsOf(linked));
  const { t } = v;
  const access = linked.role === "ADMIN" ? "" : hasAccess(linked, now) && linked.accessUntil
    ? t(`Таны эрх ${v.date(linked.accessUntil)} хүртэл хүчинтэй.`, `Your access runs until ${v.date(linked.accessUntil)}.`)
    : t("Таны эрхийн хугацаа дууссан байна: эрх сунгагдсаны дараа дохио ирж эхэлнэ.", "Your access has expired: signals start once it is renewed.");
  await sendMessage(linked.telegramChatId!, [
    esc(t(`Холбогдлоо, ${linked.name}. Setup идэвхжих бүрд орох, stop, target-тай мессеж энд ирнэ.`, `Linked, ${linked.name}. Each time a setup becomes active, a message with the entry, stop and target arrives here.`)),
    ...(access ? [esc(access)] : []),
    "",
    helpText(linked, t),
    "",
    `<i>${esc(t("Эдгээр нь түүхэн статистик дээр суурилсан дохио, санхүүгийн зөвлөгөө биш.", "These are signals based on historical statistics, not financial advice."))}</i>`,
  ].join("\n")).catch((e) => console.error("[telegram] linked, but the welcome was not delivered", e));
  return true;
}

/** The owner said the request is not theirs: it is dropped and the chat learns nothing. */
export async function rejectPendingTelegram(userId: string): Promise<void> {
  await db.update(schema.users).set(clearPending).where(eq(schema.users.id, userId));
}

/**
 * /reset from the chat linked to an account: a one-time link (30 minutes) to set a new site password.
 * Only the linked chat can ask, a few times an hour.
 */
async function sendResetLink(chat: string, u: User, now: Date, t: T): Promise<void> {
  if (!(await hit("tg-reset", chat, LIMITS.telegramReset, now))) {
    await sendMessage(chat, esc(t("Хэт олон хүсэлт илгээлээ. Нэг цагийн дараа дахин оролдоно уу.", "Too many requests. Try again in an hour.")));
    return;
  }
  const base = siteUrl();
  if (!base) {
    await sendMessage(chat, esc(t("Сайтын хаяг тохируулагдаагүй тул холбоос илгээх боломжгүй. Админтай холбогдоно уу.", "The site address is not set, so no link can be sent. Contact the admin.")));
    return;
  }
  const { createResetToken } = await import("./passwordReset");
  const token = await createResetToken(u.id, now);
  console.warn(`[telegram] password reset link sent for user ${u.id}`);
  await sendMessage(chat, [
    esc(t("Сайтын нууц үгээ шинэчлэх холбоос (30 минут хүчинтэй, нэг удаа ажиллана):", "A link to set a new site password (valid for 30 minutes, works once):")),
    `<a href="${esc(`${base}/reset/${token}`)}">${esc(t("Нууц үг шинэчлэх", "Set a new password"))}</a>`,
    "",
    esc(t("Та өөрөө хүсээгүй бол энэ мессежийг үл тоомсорлоно уу, хэнд ч бүү дамжуул.", "If you did not ask for this, ignore it, and do not forward it to anyone.")),
  ].join("\n"));
}

/**
 * One update from Telegram. "/start <code>" links the chat to the user holding that code; an email
 * address from an unlinked chat asks that account's owner to confirm on the site; a linked chat can also ask for /status, /stop, /resume and /help. Group chats are ignored.
 */
export async function handleUpdate(update: Update, now = new Date()): Promise<void> {
  const member = update.my_chat_member;
  if (member?.chat?.id !== undefined && member.chat.id !== null) {
    // the user blocked the bot or deleted the chat: stop writing to it
    if (member.new_chat_member?.status === "kicked") await forgetChat(String(member.chat.id));
    return;
  }
  const chatId = update.message?.chat?.id;
  if (chatId === undefined || chatId === null) return;
  if (update.message?.chat?.type && update.message.chat.type !== "private") return;
  const chat = String(chatId);
  const text = update.message?.text?.trim() ?? "";
  const code = CODE.exec(text)?.[1];
  if (code) return linkChat(chat, code, now);

  const [u] = await db.select().from(schema.users).where(eq(schema.users.telegramChatId, chat)).limit(1);
  if (!u && COMMAND.exec(text)?.[1]?.toLowerCase() === "reset") {
    await sendMessage(chat, esc("Нууц үг сэргээх холбоосыг зөвхөн бүртгэлтэйгээ холбогдсон чат авна. Холбоогүй бол админтай холбогдоно уу.\n\nA password reset link is only sent to a chat already linked to the account. If yours is not linked, contact the admin.")); // i18n-ok: sent in both languages, the chat's owner is not known yet
    return;
  }
  if (!u) {
    if (EMAIL.test(text) && text.length <= 200) return requestLinkByEmail(chat, text, update.message?.from, now);
    // Nobody is known for this chat yet, so the hint goes out in both languages.
    await sendMessage(chat, esc(`${HOW_TO_LINK.mn}\n\n${HOW_TO_LINK.en}`));
    return;
  }
  const v = viewer(prefsOf(u));
  const { t } = v;
  const command = COMMAND.exec(text)?.[1]?.toLowerCase();
  if (command === "status") {
    await sendMessage(chat, await statusText(u, now, v));
  } else if (command === "setup" || command === "history" || command === "news") {
    if (!hasAccess(u, now)) { await sendMessage(chat, await statusText(u, now, v)); return; } // says how to get a plan
    const cmds = await import("./telegramCommands");
    if (command === "setup") {
      const { text: reply, png } = await cmds.setupReply(now, v);
      await deliverPhoto(chat, png, reply);
    } else await sendMessage(chat, command === "history" ? await cmds.historyReply(now, v) : await cmds.newsReply(now, v));
  } else if (command === "sample") {
    if (!hasAccess(u, now)) { await sendMessage(chat, await statusText(u, now, v)); return; } // says how to get a plan
    const cmds = await import("./telegramCommands");
    const { png, caption, text: body } = await cmds.sampleReply(now, v);
    if (png) await deliverPhoto(chat, png, caption);
    await sendMessage(chat, body);
  } else if (command === "stop" || command === "pause") {
    await db.update(schema.users).set({ signalsPaused: true }).where(eq(schema.users.id, u.id));
    await sendMessage(chat, esc(t("Дохиог түр зогсоолоо. Telegram холбоотой хэвээр. Дахин асаах бол /resume.", "Signals paused. Telegram stays linked. Send /resume to turn them back on.")));
  } else if (command === "reset") {
    await sendResetLink(chat, u, now, t);
  } else if (command === "resume") {
    await db.update(schema.users).set({ signalsPaused: false }).where(eq(schema.users.id, u.id));
    await sendMessage(chat, esc(t("Дохиог дахин асаалаа.", "Signals are back on.")));
  } else {
    await sendMessage(chat, helpText(u, t));
  }
}
