"use server";
import { revalidatePath } from "next/cache";
import { requirePaid } from "../auth";
import { saveLiveConfig, saveGateConfig, startBot, stopBot, requestCloseAll, rotateToken } from "../bot/liveDb";
import { getT } from "../prefs.server";

export type BotFormState = { error?: string; ok?: string; token?: string };

/** The MT5 account the form was about; the storage falls back to the current one if it is not the user's. */
const accountIn = (form: FormData): string | undefined => {
  const v = form.get("account");
  return typeof v === "string" ? v : undefined;
};

export async function saveBotConfigAction(_prev: BotFormState, form: FormData): Promise<BotFormState> {
  const user = await requirePaid();
  const t = await getT();
  const r = await saveLiveConfig(user.id, Object.fromEntries(form), t, accountIn(form));
  if (r.error) return r;
  revalidatePath("/bot");
  return { ok: t("Тохиргоо хадгалагдлаа", "Settings saved") };
}

export async function saveGateAction(_prev: BotFormState, form: FormData): Promise<BotFormState> {
  const user = await requirePaid();
  const t = await getT();
  const r = await saveGateConfig(user.id, Object.fromEntries(form), t, accountIn(form));
  if (r.error) return r;
  revalidatePath("/bot");
  return { ok: t("Шүүлтүүр хадгалагдлаа", "Filter saved") };
}

export async function startBotAction(form: FormData) {
  const user = await requirePaid();
  await startBot(user.id, new Date(), accountIn(form));
  revalidatePath("/bot");
}

export async function stopBotAction(form: FormData) {
  const user = await requirePaid();
  await stopBot(user.id, "MANUAL", new Date(), accountIn(form));
  revalidatePath("/bot");
}

export async function closeAllAction(form: FormData) {
  const user = await requirePaid();
  await requestCloseAll(user.id, accountIn(form));
  revalidatePath("/bot");
}

export async function rotateTokenAction(_prev: BotFormState, _form: FormData): Promise<BotFormState> {
  void _form;
  const user = await requirePaid();
  const token = await rotateToken(user.id);
  revalidatePath("/bot");
  return { token };
}
