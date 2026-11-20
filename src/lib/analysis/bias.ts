import { type Candle, type Timeframe, ema, rsi, macdHist, swings } from "./indicators";

export const MIN_CANDLES = 210;
export const WEIGHTS: Record<Timeframe, number> = { "1day": 0.35, "4h": 0.3, "1h": 0.2, "15min": 0.15 };
export type BiasLabel = "ӨСӨХ хандлага" | "УНАХ хандлага" | "ТОДОРХОЙГҮЙ";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** −100…+100 score for one timeframe; null when there is too little history. */
export function timeframeScore(candles: Candle[]): number | null {
  if (candles.length < MIN_CANDLES) return null;
  const closes = candles.map((c) => c.close);
  const last = closes.length - 1;
  const close = closes[last];
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50)[last];
  const e200 = ema(closes, 200)[last];

  let score = 0;
  // trend (±50)
  score += close > e50 ? 20 : -20;
  score += close > e200 ? 20 : -20;
  score += e20[last] > e20[last - 5] ? 10 : -10;
  // momentum (±30)
  score += clamp((rsi(closes)[last] - 50) / 20, -1, 1) * 15;
  score += macdHist(closes)[last] > 0 ? 15 : -15;
  // structure (±20)
  const { highs, lows } = swings(candles.slice(-120));
  if (highs.length >= 2 && lows.length >= 2) {
    const hUp = highs.at(-1)! > highs.at(-2)!;
    const lUp = lows.at(-1)! > lows.at(-2)!;
    const hDown = highs.at(-1)! < highs.at(-2)!;
    const lDown = lows.at(-1)! < lows.at(-2)!;
    if (hUp && lUp) score += 20;
    else if (hDown && lDown) score -= 20;
  }
  return score;
}

export function labelFor(total: number): BiasLabel {
  if (total >= 20) return "ӨСӨХ хандлага";
  if (total <= -20) return "УНАХ хандлага";
  return "ТОДОРХОЙГҮЙ";
}

/** Weighted bias across timeframes; weights are renormalised over the timeframes that have a score. */
export function combineBias(
  scores: Partial<Record<Timeframe, number | null>>,
): { total: number; buyerPct: number; label: BiasLabel } | null {
  let sum = 0;
  let weight = 0;
  for (const tf of Object.keys(WEIGHTS) as Timeframe[]) {
    const s = scores[tf];
    if (s === null || s === undefined) continue;
    sum += s * WEIGHTS[tf];
    weight += WEIGHTS[tf];
  }
  if (weight === 0) return null;
  const total = sum / weight;
  return { total, buyerPct: Math.round(50 + total / 2), label: labelFor(total) };
}
