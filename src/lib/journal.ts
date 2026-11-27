import { and, desc, eq, gte, lte, max, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** How far back a robot reports the account's history the first time it connects. */
export const JOURNAL_BACKFILL_DAYS = 90;
/** At most this many closed trades in one report; the robot sends the rest on the next syncs. */
export const JOURNAL_BATCH = 50;

export type JournalDeal = {
  ticket: string; position?: string; symbol: string; side: "BUY" | "SELL"; lots: number;
  openPrice: number; closePrice: number; openTime: Date; closeTime: Date; profit: number; magic: string;
};
export type JournalSource = "all" | "manual" | "robot";

/** The close time the robot reports from next: the newest trade kept, or the backfill horizon for a new account. */
export async function journalFrom(userId: string, login: string, now: Date): Promise<Date> {
  const [row] = await db.select({ at: max(schema.journalTrades.closeTime) }).from(schema.journalTrades)
    .where(and(eq(schema.journalTrades.userId, userId), eq(schema.journalTrades.login, login)));
  return row?.at ?? new Date(now.getTime() - JOURNAL_BACKFILL_DAYS * 864e5);
}

/** Keeps each closing deal once; returns how many were new. */
export async function storeJournal(userId: string, login: string, deals: JournalDeal[]): Promise<number> {
  if (!deals.length) return 0;
  const rows = await db.insert(schema.journalTrades)
    .values(deals.map((d) => ({ ...d, position: d.position ?? null, userId, login })))
    .onConflictDoNothing().returning({ ticket: schema.journalTrades.ticket });
  return rows.length;
}

/** A member's closed trades, oldest first. Manual = placed by hand (magic 0); robot = any expert's. */
export async function listJournal(userId: string, f: { source: JournalSource; login?: string; from?: Date; to?: Date }) {
  const j = schema.journalTrades;
  const where = [eq(j.userId, userId)];
  if (f.login) where.push(eq(j.login, f.login));
  if (f.source === "manual") where.push(eq(j.magic, "0"));
  if (f.source === "robot") where.push(ne(j.magic, "0"));
  if (f.from) where.push(gte(j.closeTime, f.from));
  if (f.to) where.push(lte(j.closeTime, f.to));
  const rows = await db.select().from(j).where(and(...where)).orderBy(desc(j.closeTime)).limit(5000);
  return rows.reverse();
}

/** The accounts a member has journal trades on. */
export async function journalLogins(userId: string): Promise<string[]> {
  const rows = await db.selectDistinct({ login: schema.journalTrades.login }).from(schema.journalTrades).where(eq(schema.journalTrades.userId, userId));
  return rows.map((r) => r.login).sort();
}
