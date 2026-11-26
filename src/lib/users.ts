import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { mnT, type T } from "./i18n";

export const BCRYPT_ROUNDS = 10;

export const normaliseEmail = (s: string) => s.trim().toLowerCase();

const registerSchema = (t: T) => z.object({
  name: z.string().trim().min(1, t("Нэрээ оруулна уу", "Enter your name")).max(80),
  email: z.string().email(t("Имэйл хаяг буруу байна", "Invalid email address")).max(200),
  password: z.string().min(8, t("Нууц үг 8-аас дээш тэмдэгттэй байх ёстой", "Password must be 8 characters or more")).max(200),
});

export async function findUserByEmail(email: string): Promise<User | null> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, normaliseEmail(email)));
  return u ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return u ?? null;
}

export async function createUser(input: { name: unknown; email: unknown; password: unknown }, role: "USER" | "ADMIN" = "USER", t: T = mnT): Promise<{ error?: string }> {
  const parsed = registerSchema(t).safeParse({ ...input, email: typeof input.email === "string" ? normaliseEmail(input.email) : input.email });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password } = parsed.data;
  if (await findUserByEmail(email)) return { error: t("Энэ имэйл бүртгэлтэй байна", "This email is already registered") };
  await db.insert(schema.users).values({ name, email, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), role });
  return {};
}

/** A real bcrypt hash of a random string: compared against when no account has the email, so both answers take as long. */
let dummyHash: Promise<string> | null = null;
const dummy = () => (dummyHash ??= bcrypt.hash(randomBytes(16).toString("hex"), BCRYPT_ROUNDS));

export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const u = await findUserByEmail(email);
  // Unknown email: bcrypt still runs, so the response time does not reveal which addresses are registered.
  const ok = await bcrypt.compare(password, u?.passwordHash ?? (await dummy()));
  return u && ok ? u : null;
}

/** The user a session token belongs to, or null when the account is gone or its sessions were revoked (password changed or reset). */
export async function userForSession(id: string, sessionVersion: number | undefined): Promise<User | null> {
  const u = await findUserById(id);
  if (!u) return null;
  return (sessionVersion ?? 0) === u.sessionVersion ? u : null;
}

/** Sets a new password and bumps session_version, which signs out every session made before. */
export async function setPassword(userId: string, password: string): Promise<void> {
  await db.update(schema.users)
    .set({ passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.id, userId));
}

/**
 * Makes sure the configured admin account exists: creates it when no account has ADMIN_EMAIL.
 * Never changes an existing account: not its password, and not its role. An existing non-admin
 * account with that email is NOT promoted (anyone could have registered the address first and would
 * then be admin with their own password); a warning is logged and the operator must sort it out by hand.
 */
export async function ensureAdmin(email: string | undefined, password: string | undefined): Promise<"created" | "exists" | "skipped" | "invalid" | "conflict"> {
  if (!email || !password) return "skipped";
  const existing = await findUserByEmail(email);
  if (existing) {
    if (existing.role === "ADMIN") return "exists";
    console.warn("[admin] ADMIN_EMAIL belongs to an existing non-admin account; it was NOT promoted. Check who registered it, then promote by hand (UPDATE users SET role = 'ADMIN' ...) if it is really yours.");
    return "conflict";
  }
  const r = await createUser({ name: "Админ", email, password }, "ADMIN"); // i18n-ok: a stored name the admin can change
  return r.error ? "invalid" : "created";
}
