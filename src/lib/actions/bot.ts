"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../auth";
import { saveLiveConfig, startBot, stopBot, requestCloseAll, rotateToken } from "../bot/liveDb";

export type BotFormState = { error?: string; ok?: string; token?: string };

export async function saveBotConfigAction(_prev: BotFormState, form: FormData): Promise<BotFormState> {
  const admin = await requireAdmin();
  const r = await saveLiveConfig(admin.id, Object.fromEntries(form));
  if (r.error) return r;
  revalidatePath("/admin/bot");
  return { ok: "Тохиргоо хадгалагдлаа" };
}

export async function startBotAction() {
  const admin = await requireAdmin();
  await startBot(admin.id, new Date());
  revalidatePath("/admin/bot");
}

export async function stopBotAction() {
  const admin = await requireAdmin();
  await stopBot(admin.id, "MANUAL", new Date());
  revalidatePath("/admin/bot");
}

export async function closeAllAction() {
  const admin = await requireAdmin();
  await requestCloseAll(admin.id);
  revalidatePath("/admin/bot");
}

export async function rotateTokenAction(_prev: BotFormState, _form: FormData): Promise<BotFormState> {
  void _form;
  const admin = await requireAdmin();
  const token = await rotateToken(admin.id);
  revalidatePath("/admin/bot");
  return { token };
}
