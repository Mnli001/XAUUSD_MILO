import type { Timeframe } from "../analysis/indicators";
import type { PriceProvider } from "../data/priceProvider";
import { withRetry } from "../retry";
import { upsertCandles, SYMBOL } from "./prices";

export type BackfillStep = { tf: Timeframe; size: number; days: number }; // days = 0 → a single request
export const BACKFILL_PLAN: BackfillStep[] = [
  { tf: "1day", size: 1500, days: 0 },
  { tf: "4h", size: 5000, days: 0 },
  { tf: "1h", size: 5000, days: 1100 },
  { tf: "15min", size: 5000, days: 1100 },
];

/** A database with less than this many 15-minute candles has not had its history loaded yet. */
export const MIN_15M_HISTORY = 5000;
export const needsBackfill = (count15m: number) => count15m < MIN_15M_HISTORY;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Loads history page by page, newest first. Network failures are retried; a timeframe that still
 * fails is skipped and reported. sleepMs respects the free plan's 8 requests per minute.
 */
export async function runBackfill(
  provider: PriceProvider,
  o: { plan?: BackfillStep[]; sleepMs?: number; retryDelayMs?: number; attempts?: number; now?: Date; log?: (line: string) => void } = {},
): Promise<{ stored: Partial<Record<Timeframe, number>>; failed: Timeframe[] }> {
  const { plan = BACKFILL_PLAN, sleepMs = 8000, retryDelayMs = 10_000, attempts = 6, now = new Date(), log = () => {} } = o;
  const stored: Partial<Record<Timeframe, number>> = {};
  const failed: Timeframe[] = [];
  for (const { tf, size, days } of plan) {
    let endDate: Date | undefined;
    let total = 0;
    const stopAt = now.getTime() - days * 864e5;
    try {
      for (;;) {
        const candles = await withRetry(() => provider.fetchCandles(SYMBOL, tf, { outputsize: size, endDate }), {
          attempts,
          delayMs: retryDelayMs,
          onRetry: (n, e) => log(`  ${tf}: ${(e as Error).message} — дахин оролдоно (${n}/${attempts - 1})`),
        });
        total += await upsertCandles(SYMBOL, tf, candles);
        log(`  ${tf}: ${total} лаа…`);
        if (sleepMs > 0) await sleep(sleepMs);
        if (days === 0 || candles.length < size || candles[0].time.getTime() <= stopAt) break;
        endDate = candles[0].time;
      }
      stored[tf] = total;
      log(`${tf}: ${total} лаа хадгаллаа`);
    } catch (e) {
      stored[tf] = total;
      failed.push(tf);
      log(`${tf}: АМЖИЛТГҮЙ (${total} лаа хадгалагдсан) — ${(e as Error).message}`);
    }
  }
  return { stored, failed };
}
