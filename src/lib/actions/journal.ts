"use server";
import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { requireUser } from "../auth";
import { getViewer } from "../prefs.server";
import { db, schema } from "../db";
import { hit } from "../rateLimit";
import { addManualTrade, deleteManualTrade, updateManualTrade } from "../journal";
import { MANUAL_MAX, parseManualTrade } from "../journalForm";

export type JournalFormState = { ok?: string; error?: string; saved?: number };

/** Writing trades down is open to every signed-in member, with or without a plan: it is their own record. */
export async function saveManualTradeAction(_prev: JournalFormState, form: FormData): Promise<JournalFormState> {
  const user = await requireUser();
  const v = await getViewer();
  const { t } = v;
  const now = new Date();
  if (!(await hit("journal-write", user.id, { max: 120, windowMs: 60 * 60e3 }, now))) return { error: t("Хэт олон оролдлого. Хэсэг хугацааны дараа дахин оролдоно уу.", "Too many tries. Try again a little later.") };
  const parsed = parseManualTrade(form, v.timeZone, now, t);
  if ("error" in parsed) return { error: parsed.error };
  const ticket = String(form.get("ticket") ?? "").trim();
  if (ticket) {
    if (!(await updateManualTrade(user.id, ticket, parsed.trade))) return { error: t("Энэ арилжаа олдсонгүй.", "That trade was not found.") };
  } else {
    const j = schema.journalTrades;
    const [{ n }] = await db.select({ n: count() }).from(j).where(and(eq(j.userId, user.id), eq(j.source, "web")));
    if (n >= MANUAL_MAX) return { error: t(`Гараар ${MANUAL_MAX} хүртэл арилжаа бичнэ.`, `You can write down up to ${MANUAL_MAX} trades.`) };
    await addManualTrade(user.id, parsed.trade);
  }
  revalidatePath("/journal");
  return { ok: ticket ? t("Арилжаа шинэчлэгдлээ.", "Trade updated.") : t("Арилжаа журналд орлоо.", "Trade added to the journal."), saved: now.getTime() };
}

/** Deletes one written trade (MT5 rows cannot be deleted: the robot reports them). */
export async function deleteManualTradeAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const ticket = String(form.get("ticket") ?? "").trim();
  if (ticket) await deleteManualTrade(user.id, ticket);
  revalidatePath("/journal");
}
