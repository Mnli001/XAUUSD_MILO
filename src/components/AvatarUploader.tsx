"use client";
import { startTransition, useActionState, useRef, useState } from "react";
import { removeAvatarAction, uploadAvatarAction, type AvatarState } from "@/lib/actions/avatar";
import { useT } from "./PrefsProvider";
import { Avatar } from "./Avatar";

const SIZE = 256;

/** Draws the picture's centre square at 256 px and encodes it small (WebP, or JPEG where WebP cannot be written). */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bmp.close();
  const encode = (type: string, q: number) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, q));
  const webp = await encode("image/webp", 0.86);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg", 0.88);
  if (!jpeg) throw new Error("encode failed");
  return jpeg;
}

/** The profile picture with buttons to change or remove it. The picture is cropped to a square and shrunk before it leaves the device. */
export function AvatarUploader({ name, src }: { name: string; src: string | null }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [up, upload, upPending] = useActionState<AvatarState, FormData>(uploadAvatarAction, {});
  const [rm, remove, rmPending] = useActionState<AvatarState, FormData>(removeAvatarAction, {});
  const [local, setLocal] = useState<{ error?: string; preview?: string }>({});
  const busy = upPending || rmPending;
  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await shrink(file);
      setLocal({ preview: URL.createObjectURL(blob) });
      const fd = new FormData();
      fd.set("avatar", blob, "avatar");
      startTransition(() => upload(fd));
    } catch {
      setLocal({ error: t("Энэ зургийг уншиж чадсангүй. JPG, PNG эсвэл WebP зураг сонгоно уу.", "This picture could not be read. Choose a JPG, PNG or WebP picture.") });
    } finally {
      if (input.current) input.current.value = "";
    }
  };
  const shown = local.preview && !up.error ? local.preview : src;
  const message = local.error ?? up.error ?? rm.error ?? up.ok ?? rm.ok;
  const bad = !!(local.error ?? up.error ?? rm.error);
  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={t("Profile зураг солих", "Change profile picture")}
        className="group relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400 disabled:opacity-60">
        <Avatar name={name} src={shown ?? null} size={112} className="text-[40px]" />
        <span aria-hidden className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-xs font-semibold text-zinc-50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {busy ? t("Хадгалж байна…", "Saving…") : t("Солих", "Change")}
        </span>
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
      <div className="flex gap-2">
        <button type="button" className="btn-ghost min-h-9 px-3 text-xs sm:min-h-9" disabled={busy} onClick={() => input.current?.click()}>{src || local.preview ? t("Зураг солих", "Change picture") : t("Зураг оруулах", "Add a picture")}</button>
        {(src || (local.preview && !up.error)) && (
          <button type="button" className="btn-ghost min-h-9 px-3 text-xs text-zinc-400 sm:min-h-9" disabled={busy} onClick={() => { setLocal({}); startTransition(() => remove(new FormData())); }}>{t("Устгах", "Remove")}</button>
        )}
      </div>
      {message && <p role={bad ? "alert" : "status"} className={`text-xs ${bad ? "text-red-400" : "text-emerald-400"}`}>{message}</p>}
    </div>
  );
}
