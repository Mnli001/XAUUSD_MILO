"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "../auth";
import { grantAccess, revokeAccess, saveEvent, deleteEvent, changePassword, changeName } from "../admin";
import { getT } from "../prefs.server";

export type AdminState = { error?: string; ok?: string };

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
  const r = await changePassword(user.id, String(form.get("current") ?? ""), String(form.get("next") ?? ""), t);
  return r.error ? r : { ok: t("Нууц үг солигдлоо", "Password changed") };
}

export async function startPaperAction() {
  const admin = await requireAdmin();
  const { startPaper } = await import("../bot/paperDb");
  await startPaper(admin.id, new Date());
  revalidatePath("/admin/bot/paper");
}
