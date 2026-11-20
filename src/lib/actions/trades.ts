"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { saveTrade, deleteTrade, validateImage, type TradeImage } from "../trades";
import { ubLocalToUtc } from "../time";
import type { FormState } from "./session";

/** datetime-local value typed in UB time -> ISO string; blank stays blank. */
function ubInput(v: FormDataEntryValue | null): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return "";
  return ubLocalToUtc(v.slice(0, 10), v.slice(11, 16)).toISOString();
}

export async function saveTradeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = (form.get("id") as string) || null;
  let image: TradeImage | undefined;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    const err = validateImage(file);
    if (err) return { error: err };
    image = { bytes: Buffer.from(await file.arrayBuffer()), mime: file.type };
  }
  const r = await saveTrade(user.id, id, {
    direction: form.get("direction"), lots: form.get("lots"), entryPrice: form.get("entryPrice"), exitPrice: form.get("exitPrice"),
    stopLoss: form.get("stopLoss"), takeProfit: form.get("takeProfit"), note: form.get("note"),
    openedAt: ubInput(form.get("openedAt")), closedAt: ubInput(form.get("closedAt")),
  }, image);
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
