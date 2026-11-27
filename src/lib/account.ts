import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { findUserById } from "./users";
import { hasAccess } from "./access";
import { cancelIntent, wireConfig, type WireConfig } from "./wire";

export const SIGNAL_SETUPS = ["asian-breakout", "ny-open-breakout", "ny-late-breakout"] as const;
export type SignalSetup = (typeof SIGNAL_SETUPS)[number];

const muted = (u: Pick<User, "signalsMuted">) => u.signalsMuted.split(",").filter(Boolean);

/** Whether a linked user should get the Telegram message for this setup. */
export function wantsSignal(u: Pick<User, "signalsPaused" | "signalsMuted">, setupId: string): boolean {
  return !u.signalsPaused && !muted(u).includes(setupId);
}

/**
 * `wanted` is the list of setups the user ticked; the rest are muted. Pausing keeps the choices.
 * `news` turns the heads-up before HIGH-impact releases on or off; left out, it is not changed.
 */
export async function saveSignalPrefs(userId: string, input: { paused: boolean; wanted: string[]; news?: boolean }): Promise<{ error?: "setup" }> {
  if (input.wanted.some((id) => !(SIGNAL_SETUPS as readonly string[]).includes(id))) return { error: "setup" };
  const signalsMuted = SIGNAL_SETUPS.filter((id) => !input.wanted.includes(id)).join(",");
  await db.update(schema.users).set({ signalsPaused: input.paused, signalsMuted, ...(input.news === undefined ? {} : { signalsNews: input.news }) }).where(eq(schema.users.id, userId));
  return {};
}

/**
 * Removes the user and, through the foreign keys, their journal, bot and bot history. Admins are kept, and so is a
 * member whose paid plan is still running (`active`): the days they paid for would be lost. Once it has ended, or
 * for someone who never paid, deletion goes through.
 * Payments are kept as the record of money received (user_id becomes null); any still open is cancelled at
 * Wire first (best effort) and marked EXPIRED, so nobody pays for an account that no longer exists.
 */
export async function deleteAccount(userId: string, password: string, cfg: WireConfig | null = wireConfig(process.env), now = new Date()): Promise<{ error?: "password" | "admin" | "active" }> {
  const u = await findUserById(userId);
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) return { error: "password" };
  if (u.role === "ADMIN") return { error: "admin" };
  if (hasAccess(u, now)) return { error: "active" };
  const open = await db.update(schema.payments).set({ status: "EXPIRED", adminNote: "account deleted while this payment was open" })
    .where(and(eq(schema.payments.userId, userId), eq(schema.payments.status, "PENDING"))).returning();
  for (const p of open) {
    if (cfg && p.providerRef) await cancelIntent(cfg, p.providerRef, `xau-${p.id}-cancel`).catch((e) => console.warn("[wire] could not cancel an open payment of a deleted account", p.id, e instanceof Error ? e.message : e));
  }
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  return {};
}
