"use server";
import "../i18n.server";
import { revalidatePath } from "next/cache";
import { requireUser, signOut } from "../auth";
import { deleteAccount, saveSignalPrefs } from "../account";
import { getT, rememberPrefs } from "../prefs.server";
import { savePrefs } from "../prefsDb";

export type SettingsState = { error?: string; ok?: string };

/** Language, theme and time zone: whichever of them the form sent. */
export async function savePrefsAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const sent = (name: string) => (form.has(name) ? form.get(name) : undefined);
  const r = await savePrefs(user.id, { locale: sent("locale"), theme: sent("theme"), timeZone: sent("timeZone") });
  if (!r.prefs) {
    const t = await getT();
    return { error: r.error === "timeZone" ? t("Ийм цагийн бүс алга", "That time zone is not known") : t("Хадгалж чадсангүй", "Could not save") };
  }
  await rememberPrefs(r.prefs);
  revalidatePath("/", "layout");
  const t = (await import("../i18n")).translator(r.prefs.locale); // answer in the language just chosen
  return { ok: t("Хадгаллаа", "Saved") };
}

export async function saveSignalPrefsAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const t = await getT();
  const r = await saveSignalPrefs(user.id, { paused: form.get("paused") === "on", wanted: form.getAll("setup").map(String), news: form.get("news") === "on" });
  if (r.error) return { error: t("Хадгалж чадсангүй", "Could not save") };
  revalidatePath("/settings");
  return { ok: t("Хадгаллаа", "Saved") };
}

export async function deleteAccountAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const t = await getT();
  const r = await deleteAccount(user.id, String(form.get("password") ?? ""));
  if (r.error === "admin") return { error: t("Админ бүртгэлийг устгах боломжгүй", "An admin account cannot be deleted") };
  if (r.error === "active") return { error: t("Багц идэвхтэй байгаа тул бүртгэлийг устгах боломжгүй. Багцын хугацаа дууссаны дараа устгана уу.", "Your plan is still active, so the account cannot be deleted. Delete it after the plan ends.") };
  if (r.error) return { error: t("Нууц үг буруу байна", "Wrong password") };
  await signOut({ redirectTo: "/" });
  return {};
}
