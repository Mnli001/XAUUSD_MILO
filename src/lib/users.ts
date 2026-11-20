import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import type { User } from "./db/schema";

export const normaliseEmail = (s: string) => s.trim().toLowerCase();

const registerSchema = z.object({
  name: z.string().trim().min(1, "Нэрээ оруулна уу").max(80),
  email: z.string().email("Имэйл хаяг буруу байна").max(200),
  password: z.string().min(8, "Нууц үг 8-аас дээш тэмдэгттэй байх ёстой").max(200),
});

export async function findUserByEmail(email: string): Promise<User | null> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, normaliseEmail(email)));
  return u ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return u ?? null;
}

export async function createUser(input: { name: unknown; email: unknown; password: unknown }, role: "USER" | "ADMIN" = "USER"): Promise<{ error?: string }> {
  const parsed = registerSchema.safeParse({ ...input, email: typeof input.email === "string" ? normaliseEmail(input.email) : input.email });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password } = parsed.data;
  if (await findUserByEmail(email)) return { error: "Энэ имэйл бүртгэлтэй байна" };
  await db.insert(schema.users).values({ name, email, passwordHash: await bcrypt.hash(password, 10), role });
  return {};
}

export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const u = await findUserByEmail(email);
  if (!u) return null;
  return (await bcrypt.compare(password, u.passwordHash)) ? u : null;
}
