import { and, asc, eq, gte, lte } from "drizzle-orm";
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
