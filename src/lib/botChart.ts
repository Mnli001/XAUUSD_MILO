import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "./db";

/** One trade the robot closed, as the chart and its history list draw it. Times are ISO strings (sent as JSON). */
export type BotChartTrade = { ticket: string; side: "BUY" | "SELL"; lots: number; openPrice: number; closePrice: number; profit: number; openedAt: string | null; closedAt: string };
export type BotOpenPosition = { ticket: string; side: string; lots: number; openPrice: number; sl: number; tp: number; profit: number };
export type BotChartData = { trades: BotChartTrade[]; open: BotOpenPosition[] };

/** The robot's closed trades on one of the user's accounts (newest first) and the positions it holds now. */
export async function botChartData(userId: string, login: string, limit = 300): Promise<BotChartData> {
  const d = schema.botDeals, e = schema.botEntries;
  const rows = await db.select({ ticket: d.ticket, side: d.side, lots: d.lots, openPrice: d.openPrice, closePrice: d.closePrice, profit: d.profit, closeTime: d.closeTime, openedAt: e.openedAt })
    .from(d).leftJoin(e, and(eq(e.userId, d.userId), eq(e.login, d.login), eq(e.ticket, d.position)))
    .where(and(eq(d.userId, userId), eq(d.login, login))).orderBy(desc(d.closeTime)).limit(limit);
  const [live] = await db.select({ status: schema.botLive.status }).from(schema.botLive).where(and(eq(schema.botLive.userId, userId), eq(schema.botLive.login, login)));
  const positions = (live?.status as { positions?: BotOpenPosition[] } | null)?.positions;
  return {
    trades: rows.map((r) => ({ ticket: r.ticket, side: r.side === "SELL" ? "SELL" : "BUY", lots: r.lots, openPrice: r.openPrice, closePrice: r.closePrice, profit: r.profit, openedAt: r.openedAt?.toISOString() ?? null, closedAt: r.closeTime.toISOString() })),
    open: Array.isArray(positions) ? positions : [],
  };
}
