import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import { findUserById } from "./users";
import { ubLocalToUtc } from "./time";
import { EVENT_TYPES } from "./data/calendarProvider";
import { mnT, type T } from "./i18n";

async function assertAdmin(adminId: string) {
  const a = await findUserById(adminId);
  if (!a || a.role !== "ADMIN") throw new Error("Админ эрх шаардлагатай"); // i18n-ok: never reaches a page, the caller is checked first
}

/** Adds `days` of access starting from the later of now and the current expiry. */
export async function grantAccess(adminId: string, userId: string, days: number, now: Date, t: T = mnT): Promise<Date> {
  await assertAdmin(adminId);
  if (!Number.isFinite(days) || days <= 0 || days > 3660) throw new Error(t("Хоногийн тоо буруу байна", "Invalid number of days"));
  const u = await findUserById(userId);
  if (!u) throw new Error(t("Хэрэглэгч олдсонгүй", "User not found"));
  const base = u.accessUntil && u.accessUntil > now ? u.accessUntil : now;
  const until = new Date(base.getTime() + days * 864e5);
  await db.update(schema.users).set({ accessUntil: until }).where(eq(schema.users.id, userId));
  return until;
}

export async function revokeAccess(adminId: string, userId: string): Promise<void> {
  await assertAdmin(adminId);
  await db.update(schema.users).set({ accessUntil: null }).where(eq(schema.users.id, userId));
}

const blank = (v: unknown) => (v === "" || v === undefined || v === null ? null : v);
const optionalText = z.preprocess(blank, z.string().trim().max(40).nullable());
const eventSchema = (t: T) => z.object({
  type: z.string().trim().min(1, t("Төрөл оруулна уу", "Enter a type")).max(30).transform((s) => s.toUpperCase()),
  title: z.string().trim().min(1, t("Гарчиг оруулна уу", "Enter a title")).max(120),
  ubDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t("Огноо буруу байна", "Invalid date")),
  ubTime: z.string().regex(/^\d{2}:\d{2}$/, t("Цаг буруу байна", "Invalid time")),
  impact: z.enum(["HIGH", "MEDIUM", "LOW"], { message: t("Нөлөөлөл сонгоно уу", "Choose an impact") }),
  forecast: optionalText,
  previous: optionalText,
  actual: optionalText,
});

/** Creates (id = null) or edits a calendar event; date and time are entered in UB time. */
export async function saveEvent(adminId: string, id: string | null, data: unknown, t: T = mnT): Promise<{ error?: string }> {
  await assertAdmin(adminId);
  const parsed = eventSchema(t).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { ubDate, ubTime, ...rest } = parsed.data;
  const time = ubLocalToUtc(ubDate, ubTime);
  if (Number.isNaN(time.getTime())) return { error: t("Огноо буруу байна", "Invalid date") };
  const country = EVENT_TYPES.find((e) => e.type === rest.type)?.country ?? "АНУ"; // i18n-ok: stored, shown through countryName()
  try {
    if (id === null) await db.insert(schema.economicEvents).values({ ...rest, time, country, source: "admin" });
    else await db.update(schema.economicEvents).set({ ...rest, time, country }).where(eq(schema.economicEvents.id, id));
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") return { error: t("Ийм төрөл, цагтай мэдээ аль хэдийн бүртгэлтэй байна", "A release of this type at this time is already on record") };
    throw e;
  }
  return {};
}

export async function deleteEvent(adminId: string, id: string): Promise<void> {
  await assertAdmin(adminId);
  await db.delete(schema.economicEvents).where(eq(schema.economicEvents.id, id));
}

export async function changePassword(userId: string, current: string, next: string, t: T = mnT): Promise<{ error?: string }> {
  const u = await findUserById(userId);
  if (!u || !(await bcrypt.compare(current, u.passwordHash))) return { error: t("Одоогийн нууц үг буруу байна", "Current password is wrong") };
  if (next.length < 8 || next.length > 200) return { error: t("Шинэ нууц үг 8-аас дээш тэмдэгттэй байх ёстой", "New password must be 8 characters or more") };
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(next, 10) }).where(eq(schema.users.id, userId));
  return {};
}

export async function changeName(userId: string, name: string, t: T = mnT): Promise<{ error?: string }> {
  const n = name.trim();
  if (n.length < 1 || n.length > 80) return { error: t("Нэрээ оруулна уу", "Enter your name") };
  await db.update(schema.users).set({ name: n }).where(eq(schema.users.id, userId));
  return {};
}
