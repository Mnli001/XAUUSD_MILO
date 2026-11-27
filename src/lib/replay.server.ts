import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { loadCandles, SYMBOL } from "./ingest/prices";
import type { Bar } from "./replay";

const DAY = 864e5;
const FULL_DAY = 90; // a day with fewer 15-minute bars is a holiday or a gap
const CONTEXT = 192; // two days of 15-minute bars shown before the replay starts

/** Past days (UTC) of the last two years with a full set of 15-minute bars, oldest first; the last two days are left out. */
export async function replayDays(now: Date): Promise<string[]> {
  const c = schema.candles;
  const day = sql<string>`to_char(date_trunc('day', ${c.time} at time zone 'UTC'), 'YYYY-MM-DD')`;
  const rows = await db.select({ day, n: sql<number>`count(*)::int` }).from(c)
    .where(and(eq(c.symbol, SYMBOL), eq(c.timeframe, "15min"), gte(c.time, new Date(now.getTime() - 730 * DAY)), lt(c.time, new Date(Math.floor(now.getTime() / DAY) * DAY - DAY))))
    .groupBy(day).orderBy(day);
  return rows.filter((r) => r.n >= FULL_DAY).map((r) => r.day);
}

/** The bars before the day (shown at once) and the day's bars (played one by one), or null for a day not on offer. */
export async function loadReplay(day: string, now: Date): Promise<{ day: string; context: Bar[]; replay: Bar[] } | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(await replayDays(now)).includes(day)) return null;
  const start = new Date(`${day}T00:00:00Z`);
  const toBar = (c: { time: Date; open: number; high: number; low: number; close: number }): Bar => ({ time: c.time.getTime(), open: c.open, high: c.high, low: c.low, close: c.close });
  const context = (await loadCandles(SYMBOL, "15min", CONTEXT, start)).map(toBar);
  const replay = (await loadCandles(SYMBOL, "15min", 110, new Date(start.getTime() + DAY))).map(toBar).filter((b) => b.time >= start.getTime());
  return { day, context, replay };
}
