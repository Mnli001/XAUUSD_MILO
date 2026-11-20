import { and, asc, eq, gte } from "drizzle-orm";
import { db, schema } from "../db";
import { findUserById } from "../users";
import { loadCandles, SYMBOL } from "../ingest/prices";
import { paperReport, type PaperReport } from "./paper";

const ID = "paper";
const DAY = 864e5;

export async function getPaperStart(): Promise<Date | null> {
  const [row] = await db.select().from(schema.botState).where(eq(schema.botState.id, ID));
  return row?.startedAt ?? null;
}

/** Starts the forward test. The start time is set once; calling again returns the original time. */
export async function startPaper(adminId: string, now: Date): Promise<Date> {
  const admin = await findUserById(adminId);
  if (!admin || admin.role !== "ADMIN") throw new Error("Админ эрх шаардлагатай");
  await db.insert(schema.botState).values({ id: ID, startedAt: now }).onConflictDoNothing({ target: schema.botState.id });
  return (await getPaperStart())!;
}

export async function getPaperReport(now: Date): Promise<PaperReport | null> {
  const [state] = await db.select().from(schema.botState).where(eq(schema.botState.id, ID));
  if (!state) return null;
  const from = new Date(state.startedAt.getTime() - 2 * DAY);
  const [m15rows, d1, events] = await Promise.all([
    db.select().from(schema.candles)
      .where(and(eq(schema.candles.symbol, SYMBOL), eq(schema.candles.timeframe, "15min"), gte(schema.candles.time, from)))
      .orderBy(asc(schema.candles.time)),
    loadCandles(SYMBOL, "1day", 700),
    db.select({ time: schema.economicEvents.time }).from(schema.economicEvents)
      .where(and(eq(schema.economicEvents.impact, "HIGH"), gte(schema.economicEvents.time, from))),
  ]);
  const m15 = m15rows.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));
  return paperReport({ m15, d1, news: events.map((e) => e.time) }, state.startedAt, now, state.startBalance);
}
