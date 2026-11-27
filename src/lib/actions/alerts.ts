"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { getT } from "../prefs.server";
import { hasAccess } from "../access";
import { getQuote } from "../feed";
import { loadCandles } from "../ingest/prices";
import { GOLD, isAlertSymbol } from "../marketList";
import { MAX_ACTIVE_ALERTS, createPriceAlert, deletePriceAlert } from "../priceAlerts";
import { hit, LIMITS } from "../rateLimit";
import { MAX_CONDITION_ALERTS, createConditionAlert, deleteConditionAlert, type ConditionKind, type ConditionTimeframe } from "../conditionAlerts";

export type AlertState = { ok?: string; error?: string };

export async function createPriceAlertAction(_prev: AlertState, form: FormData): Promise<AlertState> {
  const user = await requireUser();
  const t = await getT();
  const now = new Date();
  if (!hasAccess(user, now)) return { error: t("Үнийн сэрэмжлүүлэг багцтай хэрэглэгчдэд.", "Price alerts come with a plan.") };
  if (!(await hit("price-alert", user.id, LIMITS.priceAlert, now))) return { error: t("Хэт олон оролдлого. Цагийн дараа дахин оролдоно уу.", "Too many tries. Try again in an hour.") };
  const level = Number(String(form.get("level") ?? "").replace(",", ".").trim());
  const raw = form.get("symbol");
  const symbol = isAlertSymbol(raw) ? raw : GOLD;
  const price = symbol === GOLD ? ((await getQuote(now))?.price ?? null) : ((await loadCandles(symbol, "1h", 1))[0]?.close ?? null);
  const r = await createPriceAlert(user.id, level, price, now, symbol);
  if (r.error === "price") return { error: t("Одоогийн үнэ алга байна. Хэсэг хугацааны дараа дахин оролдоно уу.", "There is no current price yet. Try again a little later.") };
  if (r.error === "level") return { error: t("Одоогийн үнээс өөр, түүнээс 20%-иас ихгүй зөрүүтэй үнэ оруулна уу.", "Enter a price different from the current one and within 20% of it.") };
  if (r.error === "limit") return { error: t(`Нэг дор ${MAX_ACTIVE_ALERTS} хүртэл сэрэмжлүүлэг тавина. Аль нэгийг нь устгаад дахин оролдоно уу.`, `You can have up to ${MAX_ACTIVE_ALERTS} alerts waiting. Delete one and try again.`) };
  revalidatePath(symbol === GOLD ? "/today" : "/markets");
  return { ok: t("Сэрэмжлүүлэг тавилаа.", "Alert set.") };
}

export async function deletePriceAlertAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  if (id) await deletePriceAlert(user.id, id);
  revalidatePath("/today");
  revalidatePath("/markets");
}

export async function createConditionAlertAction(_prev: AlertState, form: FormData): Promise<AlertState> {
  const user = await requireUser();
  const t = await getT();
  const now = new Date();
  if (!hasAccess(user, now)) return { error: t("Сэрэмжлүүлэг багцтай хэрэглэгчдэд.", "Alerts come with a plan.") };
  if (!(await hit("price-alert", user.id, LIMITS.priceAlert, now))) return { error: t("Хэт олон оролдлого. Цагийн дараа дахин оролдоно уу.", "Too many tries. Try again in an hour.") };
  const raw = String(form.get("value") ?? "").trim();
  const r = await createConditionAlert(user.id, {
    kind: String(form.get("kind") ?? "") as ConditionKind,
    timeframe: String(form.get("timeframe") ?? "1h") as ConditionTimeframe,
    value: raw === "" ? null : Number(raw),
  }, now);
  if (r.error === "value") return { error: t("RSI-ийн түвшинг 5–95 хооронд оруулна уу.", "Enter an RSI level between 5 and 95.") };
  if (r.error === "limit") return { error: t(`Нөхцөлт сэрэмжлүүлэг ${MAX_CONDITION_ALERTS} хүртэл тавина. Аль нэгийг нь устгаад дахин оролдоно уу.`, `You can have up to ${MAX_CONDITION_ALERTS} condition alerts. Delete one and try again.`) };
  if (r.error) return { error: t("Нөхцөлөө сонгоно уу.", "Choose a condition.") };
  revalidatePath("/today");
  return { ok: t("Сэрэмжлүүлэг тавилаа.", "Alert set.") };
}

export async function deleteConditionAlertAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  if (id) await deleteConditionAlert(user.id, id);
  revalidatePath("/today");
}
