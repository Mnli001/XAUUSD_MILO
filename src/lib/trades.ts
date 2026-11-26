import { desc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { Trade } from "./db/schema";

/**
 * The journal page is gone; the trades people wrote down before are kept so they can download them
 * (Settings, CSV) and are removed with the account.
 */
export type TradeRow = Omit<Trade, "image">;

const listColumns = {
  id: schema.trades.id, userId: schema.trades.userId, symbol: schema.trades.symbol, direction: schema.trades.direction,
  lots: schema.trades.lots, entryPrice: schema.trades.entryPrice, exitPrice: schema.trades.exitPrice, stopLoss: schema.trades.stopLoss,
  takeProfit: schema.trades.takeProfit, openedAt: schema.trades.openedAt, closedAt: schema.trades.closedAt, note: schema.trades.note,
  imageMime: schema.trades.imageMime,
};

export async function listTrades(userId: string): Promise<TradeRow[]> {
  return db.select(listColumns).from(schema.trades).where(eq(schema.trades.userId, userId)).orderBy(desc(schema.trades.openedAt));
}
