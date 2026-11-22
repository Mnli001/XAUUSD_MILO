"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { getT } from "../prefs.server";
import { botUsername, ensureWebhook, newLinkCode, sendMessage, telegramConfigured, unlinkTelegram } from "../telegram";

export type TelegramState = { error?: string; ok?: string; link?: string };

export async function linkTelegramAction(_prev: TelegramState, _form: FormData): Promise<TelegramState> {
  void _form;
  const user = await requireUser();
  const t = await getT();
  if (!telegramConfigured()) return { error: t("Telegram бот тохируулагдаагүй байна.", "The Telegram bot is not set up.") };
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    const proto = h.get("x-forwarded-proto") ?? "https";
    await ensureWebhook(`${proto}://${host}`);
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
  try {
    await sendMessage(user.telegramChatId, t("XAU Analytics: туршилтын мессеж. Setup идэвхжих үед дохио энд ирнэ.", "XAU Analytics: test message. Signals arrive here when a setup becomes active."));
    return { ok: t("Туршилтын мессеж илгээлээ. Telegram-аа шалгаарай.", "Test message sent. Check Telegram.") };
  } catch {
    return { error: t("Илгээж чадсангүй. Ботыг блоклосон бол Telegram дээр дахин Start дарна уу.", "Could not send. If you blocked the bot, press Start again in Telegram.") };
  }
}
