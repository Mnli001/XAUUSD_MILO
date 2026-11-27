import { and, asc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { surpriseStats } from "./surprise";
import { db, schema } from "./db";
import type { EconomicEvent } from "./db/schema";
import type { Reaction } from "./analysis/reaction";

export async function getEvents(from: Date, to: Date): Promise<EconomicEvent[]> {
  return db.select().from(schema.economicEvents).where(and(gte(schema.economicEvents.time, from), lte(schema.economicEvents.time, to))).orderBy(asc(schema.economicEvents.time));
}

export async function getNextHighEvent(now: Date): Promise<EconomicEvent | null> {
  const [e] = await db
    .select()
    .from(schema.economicEvents)
    .where(and(gte(schema.economicEvents.time, now), eq(schema.economicEvents.impact, "HIGH")))
    .orderBy(asc(schema.economicEvents.time))
    .limit(1);
  return e ?? null;
}

export async function getReactions(): Promise<Map<string, Reaction[]>> {
  const rows = await db.select().from(schema.eventReactions);
  return new Map(rows.map((r) => [r.type, r.stats as Reaction[]]));
}

/** For each release type: gold's move 60 minutes after past releases (3 years) that beat and that missed the forecast. */
export async function getSurprises(types: string[], now: Date): Promise<Map<string, ReturnType<typeof surpriseStats>>> {
  if (!types.length) return new Map();
  const e = schema.economicEvents;
  const past = await db.select({ type: e.type, forecast: e.forecast, actual: e.actual, move60: e.move60 }).from(e)
    .where(and(inArray(e.type, types), isNotNull(e.forecast), isNotNull(e.actual), isNotNull(e.move60), gte(e.time, new Date(now.getTime() - 3 * 365 * 864e5))));
  return new Map(types.map((ty) => [ty, surpriseStats(past.filter((p) => p.type === ty))]));
}
