import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { type CalendarProvider, EVENT_TYPES } from "../data/calendarProvider";
import { ProviderError } from "../data/priceProvider";
import { eventReaction } from "../analysis/reaction";
import { SYMBOL } from "./prices";

const DAY = 864e5;

/** Recomputes the historical reaction for every event type from the last 365 days of releases. */
export async function recomputeReactions(now: Date, symbol = SYMBOL): Promise<void> {
  const past = await db
    .select({ type: schema.economicEvents.type, time: schema.economicEvents.time })
    .from(schema.economicEvents)
    .where(and(gte(schema.economicEvents.time, new Date(now.getTime() - 365 * DAY)), lte(schema.economicEvents.time, now)));
  const byType = new Map<string, Date[]>();
  for (const e of past) byType.set(e.type, [...(byType.get(e.type) ?? []), e.time]);

  for (const [type, times] of byType) {
    const wanted = times.flatMap((t) => [0, 15, 30, 45].map((m) => new Date(t.getTime() + m * 6e4)));
    const candles = await db
      .select()
      .from(schema.candles)
      .where(and(eq(schema.candles.symbol, symbol), eq(schema.candles.timeframe, "15min"), inArray(schema.candles.time, wanted)));
    const stats = eventReaction(times, candles);
    await db
      .insert(schema.eventReactions)
      .values({ type, n: stats[0].n, stats, updatedAt: now })
      .onConflictDoUpdate({ target: schema.eventReactions.type, set: { n: stats[0].n, stats, updatedAt: now } });
  }
}

/** Pulls release dates. Existing rows (including admin edits) are never overwritten. */
export async function ingestCalendar(provider: CalendarProvider, now: Date, pastDays = 365): Promise<{ ok: boolean; stored: number; error?: string }> {
  let events: { type: string; time: Date }[];
  try {
    events = await provider.fetchEvents(new Date(now.getTime() - pastDays * DAY), new Date(now.getTime() + 60 * DAY));
  } catch (e) {
    if (e instanceof ProviderError) return { ok: false, stored: 0, error: e.message };
    throw e;
  }
  const meta = new Map(EVENT_TYPES.map((t) => [t.type, t]));
  const rows = events.flatMap((e) => {
    const m = meta.get(e.type);
    return m ? [{ type: e.type, time: e.time, title: m.title, country: m.country, impact: m.impact, source: "fred" }] : [];
  });
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(schema.economicEvents).values(rows.slice(i, i + 500)).onConflictDoNothing({ target: [schema.economicEvents.type, schema.economicEvents.time] });
  }
  await recomputeReactions(now);
  return { ok: true, stored: rows.length };
}
