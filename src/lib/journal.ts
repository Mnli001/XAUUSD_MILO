import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lte, max, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { manualProfit, type ManualTrade } from "./journalForm";

/** How far back a robot reports the account's history the first time it connects. */
export const JOURNAL_BACKFILL_DAYS = 90;
/** At most this many closed trades in one report; the robot sends the rest on the next syncs. */
export const JOURNAL_BATCH = 50;

export type JournalDeal = {
  ticket: string; position?: string; symbol: string; side: "BUY" | "SELL"; lots: number;
  openPrice: number; closePrice: number; openTime: Date; closeTime: Date; profit: number; magic: string;
};
export type JournalSource = "all" | "manual" | "robot";
/** Where a row came from: the robot's report of the MT5 account, or written on the journal page. */
export type RowOrigin = "mt5" | "web";

/** The login every written trade is filed under, so it never mixes with an MT5 account's history. */
export const MANUAL_LOGIN = "web";
export { OZ_PER_LOT, manualProfit, type ManualTrade } from "./journalForm";

const manualValues = (t: ManualTrade) => ({
  symbol: "XAUUSD", side: t.side, lots: t.lots, openPrice: t.openPrice, closePrice: t.closePrice, openTime: t.openTime, closeTime: t.closeTime,
  profit: manualProfit(t), stopLoss: t.stopLoss, note: t.note,
});
const mine = (userId: string, ticket: string) => {
  const j = schema.journalTrades;
  return and(eq(j.userId, userId), eq(j.login, MANUAL_LOGIN), eq(j.ticket, ticket), eq(j.source, "web"));
};

/** Writes a trade down; returns its ticket. */
export async function addManualTrade(userId: string, t: ManualTrade): Promise<string> {
  const ticket = randomUUID();
  await db.insert(schema.journalTrades).values({ ...manualValues(t), userId, login: MANUAL_LOGIN, ticket, magic: "0", source: "web" });
  return ticket;
}

/** Changes a written trade of this member's; false when there is no such trade (or it came from MT5). */
export async function updateManualTrade(userId: string, ticket: string, t: ManualTrade): Promise<boolean> {
  const rows = await db.update(schema.journalTrades).set(manualValues(t)).where(mine(userId, ticket)).returning({ ticket: schema.journalTrades.ticket });
  return rows.length > 0;
}

/** Deletes a written trade of this member's. MT5 rows are never touched: the robot would only send them again. */
export async function deleteManualTrade(userId: string, ticket: string): Promise<boolean> {
  const rows = await db.delete(schema.journalTrades).where(mine(userId, ticket)).returning({ ticket: schema.journalTrades.ticket });
  return rows.length > 0;
}

/** One written trade of this member's, for the edit form. */
export async function getManualTrade(userId: string, ticket: string) {
  const [row] = await db.select().from(schema.journalTrades).where(mine(userId, ticket)).limit(1);
  return row ?? null;
}

/** The close time the robot reports from next: the newest trade kept, or the backfill horizon for a new account. */
export async function journalFrom(userId: string, login: string, now: Date): Promise<Date> {
  const [row] = await db.select({ at: max(schema.journalTrades.closeTime) }).from(schema.journalTrades)
    .where(and(eq(schema.journalTrades.userId, userId), eq(schema.journalTrades.login, login)));
  return row?.at ?? new Date(now.getTime() - JOURNAL_BACKFILL_DAYS * 864e5);
}

/** Keeps each closing deal once; returns how many were new. */
export async function storeJournal(userId: string, login: string, deals: JournalDeal[]): Promise<number> {
  if (!deals.length || login === MANUAL_LOGIN) return 0; // "web" is the written trades' login, never an MT5 account
  const rows = await db.insert(schema.journalTrades)
    .values(deals.map((d) => ({ ...d, position: d.position ?? null, userId, login })))
    .onConflictDoNothing().returning({ ticket: schema.journalTrades.ticket });
  return rows.length;
}

/**
 * A member's closed trades, oldest first. Manual = placed by hand (magic 0: in MT5 or written here); robot = any
 * expert's. `origins` narrows to where rows came from (without a plan, only the written ones are shown).
 */
export async function listJournal(userId: string, f: { source: JournalSource; login?: string; from?: Date; to?: Date; origins?: RowOrigin[] }) {
  const j = schema.journalTrades;
  const where = [eq(j.userId, userId)];
  if (f.origins) where.push(inArray(j.source, f.origins.length ? f.origins : ["none"]));
  if (f.login) where.push(eq(j.login, f.login));
  if (f.source === "manual") where.push(eq(j.magic, "0"));
  if (f.source === "robot") where.push(ne(j.magic, "0"));
  if (f.from) where.push(gte(j.closeTime, f.from));
  if (f.to) where.push(lte(j.closeTime, f.to));
  const rows = await db.select().from(j).where(and(...where)).orderBy(desc(j.closeTime)).limit(5000);
  return rows.reverse();
}

/** The MT5 accounts a member has journal trades on (written trades are not an account). */
export async function journalLogins(userId: string): Promise<string[]> {
  const rows = await db.selectDistinct({ login: schema.journalTrades.login }).from(schema.journalTrades).where(and(eq(schema.journalTrades.userId, userId), eq(schema.journalTrades.source, "mt5")));
  return rows.map((r) => r.login).sort();
}
