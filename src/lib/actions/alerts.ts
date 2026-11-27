"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { getT } from "../prefs.server";
import { hasAccess } from "../access";
import { getQuote } from "../feed";
import { MAX_ACTIVE_ALERTS, createPriceAlert, deletePriceAlert } from "../priceAlerts";
import { hit, LIMITS } from "../rateLimit";

export type AlertState = { ok?: string; error?: string };

export async function createPriceAlertAction(_prev: AlertState, form: FormData): Promise<AlertState> {
  const user = await requireUser();
  const t = await getT();
  const now = new Date();
  if (!hasAccess(user, now)) return { error: t("Үнийн сэрэмжлүүлэг багцтай хэрэглэгчдэд.", "Price alerts come with a plan.") };
  if (!(await hit("price-alert", user.id, LIMITS.priceAlert, now))) return { error: t("Хэт олон оролдлого. Цагийн дараа дахин оролдоно уу.", "Too many tries. Try again in an hour.") };
  const level = Number(String(form.get("level") ?? "").replace(",", ".").trim());
  const quote = await getQuote(now);
  const r = await createPriceAlert(user.id, level, quote?.price ?? null, now);
  if (r.error === "price") return { error: t("Одоогийн үнэ алга байна. Хэсэг хугацааны дараа дахин оролдоно уу.", "There is no current price yet. Try again a little later.") };
  if (r.error === "level") return { error: t("Одоогийн үнээс өөр, түүнээс 20%-иас ихгүй зөрүүтэй үнэ оруулна уу.", "Enter a price different from the current one and within 20% of it.") };
  if (r.error === "limit") return { error: t(`Нэг дор ${MAX_ACTIVE_ALERTS} хүртэл сэрэмжлүүлэг тавина. Аль нэгийг нь устгаад дахин оролдоно уу.`, `You can have up to ${MAX_ACTIVE_ALERTS} alerts waiting. Delete one and try again.`) };
  revalidatePath("/today");
  return { ok: t("Сэрэмжлүүлэг тавилаа.", "Alert set.") };
}

export async function deletePriceAlertAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  if (id) await deletePriceAlert(user.id, id);
  revalidatePath("/today");
}
