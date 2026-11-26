import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { type Candle, type Timeframe, TIMEFRAMES, atr } from "../analysis/indicators";
import { timeframeScore, combineBias } from "../analysis/bias";
import { pivots } from "../analysis/levels";
import { hourlyTable } from "../analysis/hourly";
import { type PriceProvider, ProviderError } from "../data/priceProvider";

import { TF_MS } from "../liveBar";
export const SYMBOL = "XAUUSD";
const LOAD_LIMIT: Record<Timeframe, number> = { "15min": 400, "1h": 5000, "4h": 400, "1day": 400 };

export async function loadCandles(symbol: string, tf: Timeframe, limit: number, before?: Date): Promise<Candle[]> {
  const rows = await db
    .select()
    .from(schema.candles)
    .where(and(eq(schema.candles.symbol, symbol), eq(schema.candles.timeframe, tf), before ? lt(schema.candles.time, before) : undefined))
    .orderBy(desc(schema.candles.time))
    .limit(limit);
  return rows.reverse().map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));
}

/**
 * The candles that are final. Ingestion stores the bar still forming (the live chart and the price fallback
 * use it) and overwrites it on later runs, so a stored bar's close time having passed does not make it final:
 * a 5-minute-old copy of a bar that has since closed is still partial. A bar is final once a NEWER bar of the same
 * timeframe is stored, because the fetch that brought the newer bar ran after this one closed and, re-fetching
 * from the newest stored bar (gapSize), rewrote it with its final values. So: everything but the newest stored
 * bar, and only bars whose close time has passed. `candles` must end at the newest stored bar (loadCandles
 * without `before`). The cost: when the provider has no tick in a new bar yet, the bar before waits one run.
 */
export function finalCandles(candles: Candle[], tf: Timeframe, now: Date): Candle[] {
  const step = TF_MS[tf];
  return candles.slice(0, -1).filter((c) => c.time.getTime() + step <= now.getTime());
}

export async function upsertCandles(symbol: string, tf: Timeframe, candles: Candle[]): Promise<number> {
  for (let i = 0; i < candles.length; i += 1000) {
    await db
      .insert(schema.candles)
      .values(candles.slice(i, i + 1000).map((c) => ({ ...c, symbol, timeframe: tf })))
      .onConflictDoUpdate({
        target: [schema.candles.symbol, schema.candles.timeframe, schema.candles.time],
        set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close` },
      });
  }
  return candles.length;
}

/** Recomputes bias, hourly table and levels from stored candles and stores one snapshot row. */
export async function recomputeSnapshot(symbol: string, now: Date): Promise<void> {
  const byTf = {} as Record<Timeframe, Candle[]>;
  for (const tf of TIMEFRAMES) byTf[tf] = await loadCandles(symbol, tf, LOAD_LIMIT[tf]);

  const perTimeframe = Object.fromEntries(TIMEFRAMES.map((tf) => [tf, timeframeScore(byTf[tf])])) as Record<Timeframe, number | null>;
  const bias = combineBias(perTimeframe);
  if (!bias) return;

  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const closedDays = byTf["1day"].filter((c) => c.time < dayStart);
  const prev = closedDays.at(-1);
  const dayAtr = atr(closedDays);
  const levels = prev
    ? { ...pivots(prev), atr: Number.isNaN(dayAtr) ? null : dayAtr, prevHigh: prev.high, prevLow: prev.low, prevClose: prev.close }
    : null;

  await db.insert(schema.biasSnapshots).values({
    symbol,
    computedAt: now,
    total: bias.total,
    buyerPct: bias.buyerPct,
    label: bias.label,
    perTimeframe,
    levels,
    hourly: hourlyTable(byTf["1h"], now),
  });
  // keep a week of history
  await db.delete(schema.biasSnapshots).where(and(eq(schema.biasSnapshots.symbol, symbol), lt(schema.biasSnapshots.computedAt, new Date(now.getTime() - 7 * 864e5))));
}

/**
 * How many candles to ask for so that nothing is left out: everything since the newest stored candle (plus two
 * for the one still forming), at least 20, at most 5000 (the provider's limit). After an outage of any length the
 * hole is filled on the next run instead of staying empty for good.
 */
export async function gapSize(symbol: string, tf: Timeframe, now: Date): Promise<number> {
  const [last] = await loadCandles(symbol, tf, 1);
  if (!last) return 20;
  const missing = Math.ceil((now.getTime() - last.time.getTime()) / TF_MS[tf]) + 2;
  return Math.min(5000, Math.max(20, missing));
}

/** Pulls fresh candles. A provider failure leaves stored data untouched and is reported, never thrown. */
export async function ingestPrices(
  provider: PriceProvider,
  opts: { tfs: Timeframe[]; now: Date; outputsize?: number; symbol?: string },
): Promise<{ ok: boolean; stored: number; error?: string }> {
  const symbol = opts.symbol ?? SYMBOL;
  const fetched: [Timeframe, Candle[]][] = [];
  try {
    for (const tf of opts.tfs) fetched.push([tf, await provider.fetchCandles(symbol, tf, { outputsize: opts.outputsize ?? (await gapSize(symbol, tf, opts.now)) })]);
  } catch (e) {
    if (e instanceof ProviderError) return { ok: false, stored: 0, error: e.message };
    throw e;
  }
  let stored = 0;
  for (const [tf, candles] of fetched) stored += await upsertCandles(symbol, tf, candles);
  await recomputeSnapshot(symbol, opts.now);
  return { ok: true, stored };
}
