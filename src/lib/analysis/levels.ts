import type { Candle } from "./indicators";

export type Pivots = { p: number; r1: number; r2: number; s1: number; s2: number };

/** Classic floor pivots from the previous day's candle. */
export function pivots(prevDay: Candle): Pivots {
  const { high: h, low: l, close: c } = prevDay;
  const p = (h + l + c) / 3;
  return { p, r1: 2 * p - l, s1: 2 * p - h, r2: p + (h - l), s2: p - (h - l) };
}
