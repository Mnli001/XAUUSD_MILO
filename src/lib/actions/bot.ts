"use server";
import { revalidatePath } from "next/cache";
import { requirePaid } from "../auth";
import { saveSimpleConfig, startBot, stopBot, requestCloseAll, rotateToken } from "../bot/liveDb";
import { getT } from "../prefs.server";

export type BotFormState = { error?: string; ok?: string; token?: string };

/** The MT5 account the form was about; the storage falls back to the current one if it is not the user's. */
const accountIn = (form: FormData): string | undefined => {
  const v = form.get("account");
  return typeof v === "string" ? v : undefined;
};

/** The Bot page's one settings form (risk per trade and the real-account switch); it always keeps the Setup signals. */
export async function saveSimpleBotAction(_prev: BotFormState, form: FormData): Promise<BotFormState> {
  const user = await requirePaid();
  const t = await getT();
  const r = await saveSimpleConfig(user.id, Object.fromEntries(form), t, accountIn(form));
  if (r.error) return r;
  revalidatePath("/bot");
  return { ok: t("Хадгалагдлаа", "Saved") };
}

/** Start always runs the Setup signals (see startBot). */
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
