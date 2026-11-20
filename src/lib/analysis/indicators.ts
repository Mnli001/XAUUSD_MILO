export type Candle = { time: Date; open: number; high: number; low: number; close: number };
export type Timeframe = "15min" | "1h" | "4h" | "1day";
export const TIMEFRAMES: Timeframe[] = ["15min", "1h", "4h", "1day"];

/** Exponential moving average, seeded with the SMA of the first `period` values. */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder RSI. */
export function rsi(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= period;
  loss /= period;
  const value = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  out[period] = value();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}

/** MACD histogram: (EMA12 − EMA26) minus its EMA9. */
export function macdHist(closes: number[]): number[] {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const line = closes.map((_, i) => fast[i] - slow[i]);
  const start = line.findIndex((v) => !Number.isNaN(v));
  const out = new Array<number>(closes.length).fill(NaN);
  if (start < 0) return out;
  const signal = ema(line.slice(start), 9);
  for (let i = start; i < closes.length; i++) out[i] = line[i] - signal[i - start];
  return out;
}

/** Wilder ATR of the last bar; NaN when there is not enough history. */
export function atr(candles: Candle[], period = 14): number {
  if (candles.length <= period) return NaN;
  const tr = (i: number) => {
    const c = candles[i];
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  };
  let v = 0;
  for (let i = 1; i <= period; i++) v += tr(i);
  v /= period;
  for (let i = period + 1; i < candles.length; i++) v = (v * (period - 1) + tr(i)) / period;
  return v;
}

/** 3-bar fractal swing highs and lows, in time order. */
export function swings(candles: Candle[]): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const [a, b, c] = [candles[i - 1], candles[i], candles[i + 1]];
    if (b.high > a.high && b.high > c.high) highs.push(b.high);
    if (b.low < a.low && b.low < c.low) lows.push(b.low);
  }
  return { highs, lows };
}

/** Wilder ATR for every bar; NaN until `period` true ranges exist. Last value equals atr(candles). */
export function atrSeries(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tr = (i: number) => {
    const c = candles[i];
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  };
  let v = 0;
  for (let i = 1; i <= period; i++) v += tr(i);
  v /= period;
  out[period] = v;
  for (let i = period + 1; i < candles.length; i++) {
    v = (v * (period - 1) + tr(i)) / period;
    out[i] = v;
  }
  return out;
}
