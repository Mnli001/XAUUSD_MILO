import type { Timeframe } from "./analysis/indicators";
import { CHART_TF_MS, bucketStart, type ChartTf } from "./chartTf";

/** The parts of the live feed that hold no database access, so the browser can use them too. */
export const TF_MS: Record<Timeframe, number> = { "15min": 15 * 6e4, "1h": 36e5, "4h": 4 * 36e5, "1day": 864e5 };

/** What every page is given: the newest price, where it came from, and whether it is moving right now. */
export type Quote = { price: number; bid: number | null; ask: number | null; at: number; live: boolean; source: "mt5" | "candles" };

/**
 * Stored candles with a newer price folded in: the bar still forming is stretched to the price, or a
 * new bar is opened when the price belongs to a later one. The stored candles are not changed.
 */
export function withLive<C extends { time: Date | number; open: number; high: number; low: number; close: number }>(candles: C[], tf: Timeframe | ChartTf, price: number, at: number): C[] {
  const last = candles.at(-1);
  if (!last || !(price > 0)) return candles;
  const lastMs = typeof last.time === "number" ? last.time : last.time.getTime();
  if (at < lastMs) return candles;
  const step = CHART_TF_MS[tf];
  if (at < lastMs + step) {
    return [...candles.slice(0, -1), { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price }];
  }
  const openMs = Math.max(bucketStart(at, tf), lastMs + step);
  const time = (typeof last.time === "number" ? openMs : new Date(openMs)) as C["time"];
  return [...candles, { ...last, time, open: price, high: price, low: price, close: price }];
}
