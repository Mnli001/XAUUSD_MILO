import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { Timeframe } from "./analysis/indicators";
import type { HourRow } from "./analysis/hourly";
import { loadCandles } from "./ingest/prices";

export type Levels = { p: number; r1: number; r2: number; s1: number; s2: number; atr: number | null; prevHigh: number; prevLow: number; prevClose: number };
export type TodaySnapshot = {
  price: { last: number; changePct: number | null; updatedAt: Date; stale: boolean } | null;
  bias: { total: number; buyerPct: number; label: string; perTimeframe: Record<Timeframe, number | null>; computedAt: Date } | null;
  hourly: HourRow[] | null;
  levels: Levels | null;
};

export const STALE_AFTER_MS = 30 * 60 * 1000;

/** Everything the dashboard needs, read only from the database. Missing parts are null. */
export async function getTodaySnapshot(symbol: string, now: Date): Promise<TodaySnapshot> {
  const [last15] = (await loadCandles(symbol, "15min", 1)).slice(-1);
  const [snap] = await db
    .select()
    .from(schema.biasSnapshots)
    .where(and(eq(schema.biasSnapshots.symbol, symbol)))
    .orderBy(desc(schema.biasSnapshots.computedAt))
    .limit(1);

  const levels = (snap?.levels as Levels | null) ?? null;
  const price = last15
    ? {
        last: last15.close,
        changePct: levels ? ((last15.close - levels.prevClose) / levels.prevClose) * 100 : null,
        updatedAt: last15.time,
        stale: now.getTime() - last15.time.getTime() > STALE_AFTER_MS,
      }
    : null;

  return {
    price,
    bias: snap
      ? { total: snap.total, buyerPct: snap.buyerPct, label: snap.label, perTimeframe: snap.perTimeframe as Record<Timeframe, number | null>, computedAt: snap.computedAt }
      : null,
    hourly: snap ? (snap.hourly as HourRow[]) : null,
    levels,
  };
}
