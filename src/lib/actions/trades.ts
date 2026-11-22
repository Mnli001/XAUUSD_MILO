"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { saveTrade, deleteTrade, validateImage, type TradeImage } from "../trades";
import { zonedToUtc } from "../time";
import { getPrefs, getT } from "../prefs.server";
import type { FormState } from "./session";

/** datetime-local value typed on the user's own clock -> ISO string; blank stays blank. */
function zoneInput(v: FormDataEntryValue | null, timeZone: string): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return "";
  return zonedToUtc(v.slice(0, 10), v.slice(11, 16), timeZone).toISOString();
}

export async function saveTradeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const { timeZone } = await getPrefs();
  const t = await getT();
  const id = (form.get("id") as string) || null;
  let image: TradeImage | undefined;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    const err = validateImage(file, t);
    if (err) return { error: err };
    image = { bytes: Buffer.from(await file.arrayBuffer()), mime: file.type };
  }
  const r = await saveTrade(user.id, id, {
    direction: form.get("direction"), lots: form.get("lots"), entryPrice: form.get("entryPrice"), exitPrice: form.get("exitPrice"),
    stopLoss: form.get("stopLoss"), takeProfit: form.get("takeProfit"), note: form.get("note"),
    openedAt: zoneInput(form.get("openedAt"), timeZone), closedAt: zoneInput(form.get("closedAt"), timeZone),
  }, image, t);
  if (r.error) return { error: r.error };
  revalidatePath("/journal");
  redirect("/journal");
}

export async function deleteTradeAction(form: FormData) {
  const user = await requireUser();
  await deleteTrade(user.id, String(form.get("id")));
  revalidatePath("/journal");
  redirect("/journal");
}
