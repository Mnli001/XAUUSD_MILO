import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { findUserById } from "./users";

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

/** Removes the user and, through the foreign keys, their journal, bot and bot history. Admins are kept. */
export async function deleteAccount(userId: string, password: string): Promise<{ error?: "password" | "admin" }> {
  const u = await findUserById(userId);
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) return { error: "password" };
  if (u.role === "ADMIN") return { error: "admin" };
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  return {};
}
