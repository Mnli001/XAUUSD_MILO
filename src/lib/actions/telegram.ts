"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { botUsername, ensureWebhook, newLinkCode, sendMessage, telegramConfigured, unlinkTelegram } from "../telegram";

export type TelegramState = { error?: string; ok?: string; link?: string };

export async function linkTelegramAction(_prev: TelegramState, _form: FormData): Promise<TelegramState> {
  void _form;
  const user = await requireUser();
  if (!telegramConfigured()) return { error: "Telegram бот тохируулагдаагүй байна." };
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    const proto = h.get("x-forwarded-proto") ?? "https";
    await ensureWebhook(`${proto}://${host}`);
    const name = await botUsername();
    if (!name) return { error: "Telegram ботын нэрийг авч чадсангүй. Токеноо шалгана уу." };
    return { link: `https://t.me/${name}?start=${await newLinkCode(user.id)}` };
  } catch (e) {
    console.error("[telegram] link failed", e);
    return { error: "Telegram-тай холбогдож чадсангүй. Токен зөв эсэхийг шалгаад дахин оролдоно уу." };
  }
}

export async function unlinkTelegramAction(_prev: TelegramState, _form: FormData): Promise<TelegramState> {
  void _form;
  const user = await requireUser();
  await unlinkTelegram(user.id);
  revalidatePath("/setup");
  return { ok: "Telegram салгагдлаа." };
}

export async function testTelegramAction(_prev: TelegramState, _form: FormData): Promise<TelegramState> {
  void _form;
  const user = await requireUser();
  if (!user.telegramChatId) return { error: "Telegram холбогдоогүй байна." };
  try {
    await sendMessage(user.telegramChatId, "XAU Analytics: туршилтын мессеж. Setup идэвхжих үед дохио энд ирнэ.");
    return { ok: "Туршилтын мессеж илгээлээ. Telegram-аа шалгаарай." };
  } catch {
    return { error: "Илгээж чадсангүй. Ботыг блоклосон бол Telegram дээр дахин Start дарна уу." };
  }
}
