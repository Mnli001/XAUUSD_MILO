import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { Candle, Timeframe } from "./analysis/indicators";
import { SYMBOL, loadCandles } from "./ingest/prices";
import { withLive, type Quote } from "./liveBar";
import { watchTick } from "./priceAlerts";

export { TF_MS, withLive, type Quote } from "./liveBar";

/** A robot reports every second or two; a price older than this is no longer called live. */
export const FEED_FRESH_MS = 15_000;

export type Tick = { bid: number; ask: number; time: Date; source: string };

/** Brokers name gold XAUUSD, XAUUSDm, XAUUSD.r, GOLD and so on. */
export const isGold = (symbol: string) => /^(XAU|GOLD)/i.test(symbol.trim());

// One process serves every reader, so the row is read from the database at most once a second.
let cached: { tick: Tick | null; readAt: number } | null = null;
const CACHE_MS = process.env.NODE_ENV === "test" ? 0 : 1000;

/**
 * Keeps the price a robot just reported as the site's live price. Only called for the owner's robot.
 * A report for another instrument or with a price that cannot be real is passed over. Returns whether it was kept.
 */
export async function recordTick(report: { symbol: string; bid: number; ask: number; server?: string | null }, now: Date): Promise<boolean> {
  const { bid, ask } = report;
  if (!isGold(report.symbol) || !(bid > 0) || !(ask >= bid) || ask - bid > bid * 0.01) return false;
  const tick: Tick = { bid, ask, time: now, source: report.server?.slice(0, 80) || "MT5" };
  await db.insert(schema.liveTicks).values({ symbol: SYMBOL, ...tick })
    .onConflictDoUpdate({ target: schema.liveTicks.symbol, set: { bid, ask, time: now, source: tick.source } });
  cached = { tick, readAt: Date.now() };
  if (process.env.NODE_ENV !== "test") watchTick(bid, now); // price alerts, checked in the background
  return true;
}

export async function getTick(): Promise<Tick | null> {
  if (cached && Date.now() - cached.readAt < CACHE_MS) return cached.tick;
  const [row] = await db.select().from(schema.liveTicks).where(eq(schema.liveTicks.symbol, SYMBOL));
  const tick = row ? { bid: row.bid, ask: row.ask, time: row.time, source: row.source } : null;
  cached = { tick, readAt: Date.now() };
  return tick;
}

/** The tick when it is fresh enough to be called live, otherwise null. */
export async function getLiveTick(now: Date): Promise<Tick | null> {
  const tick = await getTick();
  return tick && now.getTime() - tick.time.getTime() <= FEED_FRESH_MS && tick.time.getTime() <= now.getTime() + 5000 ? tick : null;
}

/** The live price when the feed is up; otherwise the close of the newest stored 15-minute candle. */
export async function getQuote(now: Date): Promise<Quote | null> {
  const tick = await getLiveTick(now);
  if (tick) return { price: tick.bid, bid: tick.bid, ask: tick.ask, at: tick.time.getTime(), live: true, source: "mt5" };
  const [last] = await loadCandles(SYMBOL, "15min", 1);
  return last ? { price: last.close, bid: null, ask: null, at: last.time.getTime(), live: false, source: "candles" } : null;
}

/** Stored candles for a timeframe with the live price folded in when the feed is up. */
export async function loadLiveCandles(tf: Timeframe, limit: number, now: Date): Promise<Candle[]> {
  const [candles, tick] = await Promise.all([loadCandles(SYMBOL, tf, limit), getLiveTick(now)]);
  return tick ? withLive(candles, tf, tick.bid, tick.time.getTime()) : candles;
}
