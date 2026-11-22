"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { saveLiveConfig, startBot, stopBot, requestCloseAll, rotateToken } from "../bot/liveDb";
import { getT } from "../prefs.server";

export type BotFormState = { error?: string; ok?: string; token?: string };

export async function saveBotConfigAction(_prev: BotFormState, form: FormData): Promise<BotFormState> {
  const user = await requireUser();
  const t = await getT();
  const r = await saveLiveConfig(user.id, Object.fromEntries(form), t);
  if (r.error) return r;
  revalidatePath("/bot");
  return { ok: t("Тохиргоо хадгалагдлаа", "Settings saved") };
}

export async function startBotAction() {
  const user = await requireUser();
  await startBot(user.id, new Date());
  revalidatePath("/bot");
}

export async function stopBotAction() {
  const user = await requireUser();
  await stopBot(user.id, "MANUAL", new Date());
  revalidatePath("/bot");
}

export async function closeAllAction() {
  const user = await requireUser();
  await requestCloseAll(user.id);
  revalidatePath("/bot");
}

export async function rotateTokenAction(_prev: BotFormState, _form: FormData): Promise<BotFormState> {
  void _form;
  const user = await requireUser();
  const token = await rotateToken(user.id);
  revalidatePath("/bot");
  return { token };
}
