import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "./db";
import { setPassword } from "./users";

/**
 * One-time password reset links. There is no email, so a link is only ever handed out by the Telegram bot,
 * to the chat already linked to the account (/reset). The link carries a random 256-bit token; only its
 * SHA-256 is stored. A link works once, for 30 minutes, and a newer link replaces older unused ones.
 */
export const RESET_TTL_MS = 30 * 60e3;
const TOKEN = /^[a-f0-9]{64}$/;

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createResetToken(userId: string, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.transaction(async (tx) => {
    await tx.delete(schema.passwordResets).where(and(eq(schema.passwordResets.userId, userId), isNull(schema.passwordResets.usedAt)));
    await tx.insert(schema.passwordResets).values({ userId, tokenHash: hashOf(token), expiresAt: new Date(now.getTime() + RESET_TTL_MS), createdAt: now });
  });
  return token;
}

/** Whether the token is a live, unused reset link (for the page; the form checks again on submit). */
export async function resetTokenValid(token: string, now = new Date()): Promise<boolean> {
  if (!TOKEN.test(token)) return false;
  const [r] = await db.select({ id: schema.passwordResets.id }).from(schema.passwordResets)
    .where(and(eq(schema.passwordResets.tokenHash, hashOf(token)), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, now)));
  return !!r;
}

/**
 * Spends the token and sets the new password; every session of the account ends (session_version bump).
 * "invalid": unknown, used or expired link. "password": the new password does not meet the rules.
 */
export async function resetPasswordWithToken(token: string, password: string, now = new Date()): Promise<{ error?: "invalid" | "password"; userId?: string }> {
  if (password.length < 8 || password.length > 200) return { error: "password" };
  if (!TOKEN.test(token)) return { error: "invalid" };
  // the single UPDATE ... WHERE used_at IS NULL is what makes the link one-time under concurrent submits
  const [spent] = await db.update(schema.passwordResets).set({ usedAt: now })
    .where(and(eq(schema.passwordResets.tokenHash, hashOf(token)), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, now)))
    .returning();
  if (!spent) return { error: "invalid" };
  await setPassword(spent.userId, password);
  await db.delete(schema.passwordResets).where(and(eq(schema.passwordResets.userId, spent.userId), isNull(schema.passwordResets.usedAt)));
  console.warn(`[auth] password reset through a Telegram link for user ${spent.userId}`);
  return { userId: spent.userId };
}
