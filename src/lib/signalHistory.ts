import { NOT_SENT, listSignals } from "./signals";
import { loadCandles, SYMBOL } from "./ingest/prices";
import { signalOutcome, type Outcome } from "./signalOutcome";
import type { Signal } from "./db/schema";

const M15 = 15 * 6e4;
const MAX_BARS = 20_000; // about seven months of 15-minute candles

/** `unsent`: recorded but never sent (NOT_SENT); listed only when asked for, and never part of any total. */
export type SignalRow = Signal & { outcome: Outcome; unsent?: boolean };

/** Without a plan, the track record is shown a day late: the live signals are what a plan pays for. */
export const PUBLIC_DELAY_MS = 24 * 36e5;

/**
 * The latest signals that went out, newest first, each judged on the stored 15-minute candles. Signals recorded but
 * never sent are left out (so every total built from these rows counts only what people could act on); with
 * `includeUnsent` they are listed too, marked `unsent`, and a caller that totals must leave those out.
 */
export async function signalHistory(now: Date, limit = 60, o: { delayMs?: number; includeUnsent?: boolean } = {}): Promise<SignalRow[]> {
  const signals = await listSignals(limit, o.delayMs ? new Date(now.getTime() - o.delayMs) : undefined, { includeUnsent: o.includeUnsent });
  if (signals.length === 0) return [];
  const oldest = Math.min(...signals.map((s) => s.createdAt.getTime()));
  const bars = await loadCandles(SYMBOL, "15min", Math.min(MAX_BARS, Math.ceil((now.getTime() - oldest) / M15) + 8));
  return signals.map((s) => ({ ...s, outcome: signalOutcome(s, bars, now), unsent: s.sentTo === NOT_SENT }));
}
