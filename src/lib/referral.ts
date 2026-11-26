import { randomInt } from "node:crypto";
import { and, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { extendAccess } from "./plans";

/** Invite a friend: when the friend's first payment goes through, the inviter gets this many days, once per friend. */
export const REFERRAL_DAYS = 7;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I: read aloud and typed by hand
const CODE_LENGTH = 8;

const newCode = () => Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** This user's invite code, made the first time it is asked for. */
export async function referralCodeFor(userId: string): Promise<string> {
  const [u] = await db.select({ code: schema.users.referralCode }).from(schema.users).where(eq(schema.users.id, userId));
  if (u?.code) return u.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await db.update(schema.users).set({ referralCode: newCode() })
        .where(and(eq(schema.users.id, userId), isNull(schema.users.referralCode))).returning({ code: schema.users.referralCode });
      if (row?.code) return row.code;
      const [again] = await db.select({ code: schema.users.referralCode }).from(schema.users).where(eq(schema.users.id, userId));
      if (again?.code) return again.code; // set meanwhile by another request
    } catch { /* the code was taken: draw another */ }
  }
  throw new Error("could not make a referral code");
}

/** The user a code belongs to, or null. Codes are matched without regard to case or spaces. */
export async function referrerOf(code: unknown): Promise<string | null> {
  if (typeof code !== "string") return null;
  const c = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(c)) return null;
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.referralCode, c));
  return u?.id ?? null;
}

export async function referralStats(userId: string): Promise<{ invited: number; paid: number; daysEarned: number }> {
  const u = schema.users;
  const [{ invited }] = await db.select({ invited: count() }).from(u).where(eq(u.referredBy, userId));
  const [{ paid }] = await db.select({ paid: count() }).from(u).where(and(eq(u.referredBy, userId), isNotNull(u.referralRewardedAt)));
  return { invited, paid, daysEarned: paid * REFERRAL_DAYS };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Called inside a payment's activation: if the payer came through an invite and the inviter has not been rewarded
 * for them yet, mark it and add REFERRAL_DAYS to the inviter's access. Returns the inviter's id when it happened.
 */
export async function rewardReferrer(tx: Tx, payerId: string, now: Date): Promise<string | null> {
  const u = schema.users;
  const [payer] = await tx.update(u).set({ referralRewardedAt: now })
    .where(and(eq(u.id, payerId), isNotNull(u.referredBy), isNull(u.referralRewardedAt))).returning({ by: u.referredBy });
  if (!payer?.by) return null;
  const [r] = await tx.execute<{ access_until: Date | string | null }>(sql`SELECT access_until FROM users WHERE id = ${payer.by} FOR UPDATE`).then((x) => x.rows);
  if (!r) return null; // the inviter deleted their account
  const current = r.access_until ? new Date(r.access_until) : null;
  await tx.update(u).set({ accessUntil: extendAccess(current, now, REFERRAL_DAYS) }).where(eq(u.id, payer.by));
  return payer.by;
}
