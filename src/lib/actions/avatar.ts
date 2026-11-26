"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { checkAvatar, deleteAvatar, saveAvatar } from "../avatar";
import { getT } from "../prefs.server";

export type AvatarState = { error?: string; ok?: string };

/** Keeps the uploaded picture as the user's profile picture, after checking what the bytes really are. */
export async function uploadAvatarAction(_prev: AvatarState, form: FormData): Promise<AvatarState> {
  const user = await requireUser();
  const t = await getT();
  const file = form.get("avatar");
  if (!(file instanceof Blob)) return { error: t("Зураг сонгоно уу", "Choose a picture") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const c = checkAvatar(bytes);
  if (!c.ok) {
    return { error: c.error === "TOO_BIG" ? t("Зураг хэт том байна", "The picture is too large") : c.error === "EMPTY" ? t("Зураг сонгоно уу", "Choose a picture") : t("Зөвхөн JPG, PNG, WebP зураг", "Only JPG, PNG or WebP pictures") };
  }
  await saveAvatar(user.id, bytes, c.mime);
  revalidatePath("/", "layout");
  return { ok: t("Зураг шинэчлэгдлээ", "Picture updated") };
}

export async function removeAvatarAction(): Promise<AvatarState> {
  const user = await requireUser();
  const t = await getT();
  await deleteAvatar(user.id);
  revalidatePath("/", "layout");
  return { ok: t("Зураг устгагдлаа", "Picture removed") };
}
