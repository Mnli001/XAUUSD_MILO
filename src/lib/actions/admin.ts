"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "../auth";
import { grantAccess, revokeAccess, saveEvent, deleteEvent, changePassword, changeName } from "../admin";

export type AdminState = { error?: string; ok?: string };

export async function grantAction(form: FormData) {
  const admin = await requireAdmin();
  await grantAccess(admin.id, String(form.get("userId")), Number(form.get("days")), new Date());
  revalidatePath("/admin/users");
}

export async function revokeAction(form: FormData) {
  const admin = await requireAdmin();
  await revokeAccess(admin.id, String(form.get("userId")));
  revalidatePath("/admin/users");
}

export async function saveEventAction(_prev: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const r = await saveEvent(admin.id, (form.get("id") as string) || null, Object.fromEntries(form));
  if (r.error) return r;
  revalidatePath("/admin/events");
  return { ok: "Хадгаллаа" };
}

export async function deleteEventAction(form: FormData) {
  const admin = await requireAdmin();
  await deleteEvent(admin.id, String(form.get("id")));
  revalidatePath("/admin/events");
}

export async function changeNameAction(_prev: AdminState, form: FormData): Promise<AdminState> {
  const user = await requireUser();
  const r = await changeName(user.id, String(form.get("name") ?? ""));
  if (r.error) return r;
  revalidatePath("/", "layout");
  return { ok: "Нэр шинэчлэгдлээ" };
}

export async function changePasswordAction(_prev: AdminState, form: FormData): Promise<AdminState> {
  const user = await requireUser();
  const r = await changePassword(user.id, String(form.get("current") ?? ""), String(form.get("next") ?? ""));
  return r.error ? r : { ok: "Нууц үг солигдлоо" };
}

export async function startPaperAction() {
  const admin = await requireAdmin();
  const { startPaper } = await import("../bot/paperDb");
  await startPaper(admin.id, new Date());
  revalidatePath("/admin/bot/paper");
}
