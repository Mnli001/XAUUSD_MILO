import { eq } from "drizzle-orm";
import { db, schema } from "./db";

/** The largest picture kept. The browser shrinks it to a 256 px square first, which is usually 10–40 KB. */
export const AVATAR_MAX_BYTES = 300 * 1024;
export const AVATAR_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export type AvatarType = (typeof AVATAR_TYPES)[number];

/** What the bytes really are, by their first bytes; the browser's word for the type is not trusted. Null for anything else. */
export function sniffImage(b: Uint8Array): AvatarType | null {
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  return null;
}

export type AvatarCheck = { ok: true; mime: AvatarType } | { ok: false; error: "EMPTY" | "TOO_BIG" | "NOT_IMAGE" };

/** Whether these bytes may be kept as a profile picture. */
export function checkAvatar(b: Uint8Array): AvatarCheck {
  if (b.length === 0) return { ok: false, error: "EMPTY" };
  if (b.length > AVATAR_MAX_BYTES) return { ok: false, error: "TOO_BIG" };
  const mime = sniffImage(b);
  return mime ? { ok: true, mime } : { ok: false, error: "NOT_IMAGE" };
}

export async function saveAvatar(userId: string, bytes: Uint8Array, mime: AvatarType, now = new Date()): Promise<void> {
  const image = Buffer.from(bytes);
  await db.insert(schema.userAvatars).values({ userId, image, mime, updatedAt: now })
    .onConflictDoUpdate({ target: schema.userAvatars.userId, set: { image, mime, updatedAt: now } });
}

export async function getAvatar(userId: string): Promise<{ image: Buffer; mime: string; updatedAt: Date } | null> {
  const [row] = await db.select().from(schema.userAvatars).where(eq(schema.userAvatars.userId, userId));
  return row ? { image: row.image, mime: row.mime, updatedAt: row.updatedAt } : null;
}

export async function deleteAvatar(userId: string): Promise<void> {
  await db.delete(schema.userAvatars).where(eq(schema.userAvatars.userId, userId));
}

/** The address of a user's picture with its version, so a new picture is never served from an old cache; null without one. */
export async function avatarUrl(userId: string): Promise<string | null> {
  const [row] = await db.select({ at: schema.userAvatars.updatedAt }).from(schema.userAvatars).where(eq(schema.userAvatars.userId, userId));
  return row ? `/api/avatar?v=${row.at.getTime()}` : null;
}
