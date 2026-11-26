import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { ClosedTrade } from "./analysis/journal";

/**
 * The robot's closed trades on one MT5 account, oldest first, for the statistics. The opening time comes from the
 * entry the robot recorded for the position (robot v3.10+); older deals fall back to their close time.
 */
export async function botTrades(userId: string, login: string): Promise<ClosedTrade[]> {
  const d = schema.botDeals, e = schema.botEntries;
  const rows = await db.select({ profit: d.profit, closeTime: d.closeTime, openedAt: e.openedAt }).from(d)
    .leftJoin(e, and(eq(e.userId, d.userId), eq(e.login, d.login), eq(e.ticket, d.position)))
    .where(and(eq(d.userId, userId), eq(d.login, login)))
    .orderBy(asc(d.closeTime));
  return rows.map((r) => ({ pnl: r.profit, openedAt: r.openedAt ?? r.closeTime, closedAt: r.closeTime, r: null }));
}

/** The account asked for when it is one of the user's, else the first listed (the bot page's own choice). */
export function pickAccount(accounts: readonly { login: string }[], asked: string | undefined): string | null {
  return accounts.find((a) => a.login === asked)?.login ?? accounts[0]?.login ?? null;
}
