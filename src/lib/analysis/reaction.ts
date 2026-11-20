import type { Candle } from "./indicators";

export type Reaction = { minutes: 15 | 30 | 60; n: number; avgAbsMove: number | null; upPct: number | null };
export const MIN_EVENTS = 6;
const HORIZONS = [15, 30, 60] as const;
const M15 = 15 * 60 * 1000;

/**
 * How gold moved after past releases. Reference = open of the 15min candle that starts at the
 * release; move after N minutes = close of the candle that ends at release + N. Releases with
 * missing candles are skipped; fewer than MIN_EVENTS usable releases gives nulls.
 */
export function eventReaction(eventTimes: Date[], m15: Candle[]): Reaction[] {
  const byTime = new Map(m15.map((c) => [c.time.getTime(), c]));
  return HORIZONS.map((minutes) => {
    let n = 0;
    let abs = 0;
    let up = 0;
    for (const e of eventTimes) {
      const ref = byTime.get(e.getTime());
      const end = byTime.get(e.getTime() + minutes * 60 * 1000 - M15);
      if (!ref || !end) continue;
      const move = end.close - ref.open;
      n++;
      abs += Math.abs(move);
      if (move > 0) up++;
    }
    const enough = n >= MIN_EVENTS;
    return { minutes, n, avgAbsMove: enough ? abs / n : null, upPct: enough ? Math.round((up / n) * 100) : null };
  });
}
