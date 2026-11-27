import { and, eq, max } from "drizzle-orm";
import { db, schema } from "./db";
import { getSetups } from "./setup/build";
import { getNextHighEvent } from "./events";
import { SYMBOL } from "./ingest/prices";

/**
 * What the in-app alert sounds listen for: which setups are active right now (with the bar that made them active, so
 * the same activation is announced once) and when the next key release is.
 *
 * Every open page asks for this about once a minute, and working it out reads ~700 candles and replays every rule.
 * The answer can only change with a new 15-minute bar, so it is kept per bar: keyed by the newest stored 15-minute
 * candle (one indexed lookup), and also refreshed after ALERTS_TTL_MS so that what depends on the clock alone (a setup
 * whose entry window closes, the next release passing) is never older than that. Concurrent requests share one
 * computation.
 */
export type AlertsFeed = { active: string[]; nextRelease: string | null };

export const ALERTS_TTL_MS = process.env.NODE_ENV === "test" ? 0 : 60_000;

let memo: { key: string; at: number; feed: Promise<AlertsFeed> } | null = null;
export const forgetAlertsFeed = () => { memo = null; };

async function latestBarKey(): Promise<string> {
  const [row] = await db.select({ at: max(schema.candles.time) }).from(schema.candles)
    .where(and(eq(schema.candles.symbol, SYMBOL), eq(schema.candles.timeframe, "15min")));
  return row?.at ? new Date(row.at).toISOString() : "";
}

async function compute(now: Date): Promise<AlertsFeed> {
  const [view, next] = await Promise.all([getSetups(now), getNextHighEvent(now)]);
  return {
    active: view.setups.filter((s) => s.status === "ACTIVE").map((s) => `${s.id}@${s.at?.toISOString() ?? ""}`),
    nextRelease: next ? next.time.toISOString() : null,
  };
}

export async function getAlertsFeed(now: Date, ttlMs = ALERTS_TTL_MS): Promise<AlertsFeed> {
  const key = await latestBarKey();
  if (memo && memo.key === key && now.getTime() - memo.at < ttlMs && now.getTime() >= memo.at) return memo.feed;
  const feed = compute(now);
  const entry = { key, at: now.getTime(), feed };
  memo = entry;
  // a failed computation is not kept: the next request tries again
  feed.catch(() => { if (memo === entry) memo = null; });
  return feed;
}
