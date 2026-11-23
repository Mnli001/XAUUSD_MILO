"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { getT } from "../prefs.server";
import { botUsername, ensureWebhook, esc, forgetChat, isChatGone, newLinkCode, sendMessage, siteUrl, telegramConfigured, unlinkTelegram } from "../telegram";

export type TelegramState = { error?: string; ok?: string; link?: string };

export async function linkTelegramAction(_prev: TelegramState, _form: FormData): Promise<TelegramState> {
  void _form;
  const user = await requireUser();
  const t = await getT();
  if (!telegramConfigured()) return { error: t("Telegram бот тохируулагдаагүй байна.", "The Telegram bot is not set up.") };
  try {
    // The webhook address comes from configuration when it can: a client-supplied X-Forwarded-Host
    // must never be able to point the bot (and its secret header) at another site.
    let origin = siteUrl();
    if (!origin) {
      const h = await headers();
      origin = `${h.get("x-forwarded-proto") === "http" ? "http" : "https"}://${h.get("host") ?? ""}`;
    }
    await ensureWebhook(origin);
    const name = await botUsername();
    if (!name) return { error: t("Telegram ботын нэрийг авч чадсангүй. Токеноо шалгана уу.", "Could not get the Telegram bot's name. Check the token.") };
    return { link: `https://t.me/${name}?start=${await newLinkCode(user.id)}` };
  } catch (e) {
    console.error("[telegram] link failed", e);
    return { error: t("Telegram-тай холбогдож чадсангүй. Токен зөв эсэхийг шалгаад дахин оролдоно уу.", "Could not reach Telegram. Check that the token is correct and try again.") };
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
