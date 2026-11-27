"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser, signIn } from "../auth";
import { grantAccess, revokeAccess, saveEvent, deleteEvent, changePassword, changeName, adminResetPassword } from "../admin";
import { getT } from "../prefs.server";

export type AdminState = { error?: string; ok?: string; password?: string };

export async function grantAction(form: FormData) {
  const admin = await requireAdmin();
  await grantAccess(admin.id, String(form.get("userId")), Number(form.get("days")), new Date(), await getT());
  revalidatePath("/admin/users");
}

export async function revokeAction(form: FormData) {
  const admin = await requireAdmin();
  await revokeAccess(admin.id, String(form.get("userId")));
  revalidatePath("/admin/users");
}

export async function saveEventAction(_prev: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const t = await getT();
  const r = await saveEvent(admin.id, (form.get("id") as string) || null, Object.fromEntries(form), t);
  if (r.error) return r;
  revalidatePath("/admin/events");
  return { ok: t("Хадгаллаа", "Saved") };
}

export async function deleteEventAction(form: FormData) {
  const admin = await requireAdmin();
  await deleteEvent(admin.id, String(form.get("id")));
  revalidatePath("/admin/events");
}

export async function changeNameAction(_prev: AdminState, form: FormData): Promise<AdminState> {
  const user = await requireUser();
  const t = await getT();
  const r = await changeName(user.id, String(form.get("name") ?? ""), t);
  if (r.error) return r;
  revalidatePath("/", "layout");
  return { ok: t("Нэр шинэчлэгдлээ", "Name updated") };
}

export async function changePasswordAction(_prev: AdminState, form: FormData): Promise<AdminState> {
  const user = await requireUser();
  const t = await getT();
  const next = String(form.get("next") ?? "");
  const r = await changePassword(user.id, String(form.get("current") ?? ""), next, t);
  if (r.error) return r;
  // The change signed out every session, this one included; sign this browser back in with the new password.
  try {
    await signIn("credentials", { email: user.email, password: next, redirect: false });
  } catch (e) {
    console.warn("[auth] password changed, but re-signing this browser failed", e instanceof Error ? e.message : e);
  }
  return { ok: t("Нууц үг солигдлоо. Бусад төхөөрөмж дээрх нэвтрэлт хаагдлаа.", "Password changed. You were signed out on other devices.") };
}

/** Admin-assisted reset: a temporary password for the user, shown once to the admin; all the user's sessions end. */
export async function resetUserPasswordAction(_prev: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const t = await getT();
  const r = await adminResetPassword(admin.id, String(form.get("userId") ?? ""), t);
  if (r.error || !r.password) return { error: r.error ?? t("Алдаа гарлаа", "Something went wrong") };
  return { ok: t(`${r.email}: түр нууц үг. Хэрэглэгчид өгөөд, нэвтэрсний дараа Тохиргоо хуудаснаас солихыг хэлнэ үү.`, `${r.email}: temporary password. Give it to the user and ask them to change it on the Settings page after signing in.`), password: r.password };
}

export async function startPaperAction() {
  const admin = await requireAdmin();
  const { startPaper } = await import("../bot/paperDb");
  await startPaper(admin.id, new Date());
  revalidatePath("/admin/bot/paper");
}

/** The landing page's live record: one of this admin's own robot accounts, from a start date. */
export async function setPublicRecordAction(_prev: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const t = await getT();
  const { setPublicRecord } = await import("../publicRecord");
  const r = await setPublicRecord(admin.id, String(form.get("login") ?? ""), String(form.get("since") ?? ""), new Date(), t);
  if (r.error) return r;
  revalidatePath("/admin/record");
  revalidatePath("/");
  return { ok: t("Хадгаллаа", "Saved") };
}

export async function clearPublicRecordAction() {
  const admin = await requireAdmin();
  const { clearPublicRecord } = await import("../publicRecord");
  await clearPublicRecord(admin.id);
  revalidatePath("/admin/record");
  revalidatePath("/");
}
