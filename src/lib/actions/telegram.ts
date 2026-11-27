"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { getT } from "../prefs.server";
import { confirmPendingTelegram, rejectPendingTelegram, botUsername, esc, forgetChat, isChatGone, newLinkCode, sendMessage, siteUrl, telegramConfigured, unlinkTelegram } from "../telegram";

export type TelegramState = { error?: string; ok?: string; link?: string };

export async function linkTelegramAction(_prev: TelegramState, _form: FormData): Promise<TelegramState> {
  void _form;
  const user = await requireUser();
  const t = await getT();
  if (!telegramConfigured()) return { error: t("Telegram бот тохируулагдаагүй байна.", "The Telegram bot is not set up.") };
  // The webhook is set once at server start (instrumentation.ts) from APP_URL / RAILWAY_PUBLIC_DOMAIN only.
  // A user's button never calls setWebhook, and request headers (Host, X-Forwarded-*) are never used to build
  // the address, so nobody can point the bot and its secret header at another site.
  if (!siteUrl()) return { error: t("Сайтын хаяг (APP_URL) тохируулагдаагүй тул Telegram холбох боломжгүй байна.", "The site address (APP_URL) is not set, so Telegram cannot be linked.") };
  try {
    const name = await botUsername();
    if (!name) return { error: t("Telegram ботын нэрийг авч чадсангүй. Token-оо шалгана уу.", "Could not get the Telegram bot's name. Check the token.") };
    return { link: `https://t.me/${name}?start=${await newLinkCode(user.id)}` };
  } catch (e) {
    console.error("[telegram] link failed", e);
    return { error: t("Telegram-тай холбогдож чадсангүй. Token зөв эсэхийг шалгаад дахин оролдоно уу.", "Could not reach Telegram. Check that the token is correct and try again.") };
  }
}

export async function unlinkTelegramAction(_prev: TelegramState, _form: FormData): Promise<TelegramState> {
  void _form;
  const user = await requireUser();
  const t = await getT();
  await unlinkTelegram(user.id);
  revalidatePath("/setup");
  revalidatePath("/settings");
  return { ok: t("Telegram салгагдлаа.", "Telegram unlinked.") };
}

export async function testTelegramAction(_prev: TelegramState, _form: FormData): Promise<TelegramState> {
  void _form;
  const user = await requireUser();
  const t = await getT();
  if (!user.telegramChatId) return { error: t("Telegram холбогдоогүй байна.", "Telegram is not linked.") };
  if (!telegramConfigured()) return { error: t("Telegram бот тохируулагдаагүй байна.", "The Telegram bot is not set up.") };
  try {
    await sendMessage(user.telegramChatId, esc(t("XAU Analytics: туршилтын мессеж. Setup идэвхжих үед дохио энд ирнэ. /status, /stop командыг энд бичиж болно.", "XAU Analytics: test message. Signals arrive here when a setup becomes active. You can send /status or /stop here.")));
    return { ok: t("Туршилтын мессеж илгээлээ. Telegram-аа шалгаарай.", "Test message sent. Check Telegram.") };
  } catch (e) {
    if (isChatGone(e)) {
      // the bot was blocked or the chat deleted: the link is useless, so it is removed and can be made again
      await forgetChat(user.telegramChatId);
      revalidatePath("/setup");
      revalidatePath("/settings");
      return { error: t("Ботыг блоклосон эсвэл чатыг устгасан тул Telegram салгагдлаа. “Telegram холбох”-оор дахин холбоно уу.", "The bot was blocked or the chat deleted, so Telegram was unlinked. Link it again with “Link Telegram”.") };
    }
    return { error: t("Telegram одоо хариу өгсөнгүй. Хэдэн минутын дараа дахин оролдоно уу.", "Telegram did not answer just now. Try again in a few minutes.") };
  }
}

/** "Yes, it's mine": the chat that gave this account's email to the bot is linked. */
export async function confirmTelegramAction(_prev: TelegramState, _form: FormData): Promise<TelegramState> {
  void _form;
  const user = await requireUser();
  const t = await getT();
  const ok = await confirmPendingTelegram(user.id);
  revalidatePath("/", "layout");
  return ok ? { ok: t("Telegram холбогдлоо.", "Telegram linked.") } : { error: t("Хүсэлтийн хугацаа дууссан байна. Ботод имэйлээ дахин илгээнэ үү.", "The request has expired. Send your email to the bot again.") };
}

/** "No, not mine": the request is dropped. */
export async function rejectTelegramAction(_prev: TelegramState, _form: FormData): Promise<TelegramState> {
  void _form;
  const user = await requireUser();
  const t = await getT();
  await rejectPendingTelegram(user.id);
  revalidatePath("/", "layout");
  return { ok: t("Хүсэлтийг татгалзлаа.", "Request declined.") };
}
