"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { getT } from "../prefs.server";
import { hasAccess } from "../access";
import { deleteRiskRule, saveRiskRule } from "../risk";

export type RiskState = { ok?: string; error?: string };
const num = (v: FormDataEntryValue | null) => { const s = String(v ?? "").replace(",", ".").trim(); return s === "" ? null : Number(s); };

export async function saveRiskAction(_prev: RiskState, form: FormData): Promise<RiskState> {
  const user = await requireUser();
  const t = await getT();
  if (!hasAccess(user, new Date())) return { error: t("Эрсдэлийн менежер багцтай хэрэглэгчдэд.", "The risk manager comes with a plan.") };
  const login = String(form.get("login") ?? "");
  if (!login) return { error: t("Эхлээд MT5-аа холбоно уу.", "Connect your MT5 first.") };
  if (form.get("remove") === "1") { await deleteRiskRule(user.id, login); revalidatePath("/bot"); return { ok: t("Хязгааруудыг арилгалаа.", "Limits removed.") }; }
  const r = await saveRiskRule(user.id, login, {
    accountSize: num(form.get("accountSize")) ?? NaN,
    dailyLossPct: num(form.get("dailyLossPct")) ?? NaN,
    maxLossPct: num(form.get("maxLossPct")) ?? NaN,
    profitTargetPct: num(form.get("profitTargetPct")),
    closeOnBreach: form.get("closeOnBreach") === "on",
  });
  const errors = {
    accountSize: t("Дансны хэмжээг 0-ээс их тоогоор оруулна уу.", "Enter the account size as a number above 0."),
    dailyLossPct: t("Өдрийн хязгаар 0–50% байна.", "The daily limit must be 0–50%."),
    maxLossPct: t("Нийт хязгаар 0–100% бөгөөд өдрийн хязгаараас бага биш байна.", "The overall limit must be 0–100% and not below the daily limit."),
    profitTargetPct: t("Ашгийн зорилт 0-ээс их хувь байна.", "The profit target must be a percent above 0."),
  };
  if (r.error) return { error: errors[r.error] };
  revalidatePath("/bot");
  return { ok: t("Хадгаллаа. Дараагийн тайлангаас эхлэн мөрдөнө.", "Saved. It applies from the robot's next report.") };
}
