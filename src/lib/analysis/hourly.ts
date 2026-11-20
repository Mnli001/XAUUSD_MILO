import { type Candle, ema } from "./indicators";
import { ubHour, sessionOfUbHour } from "../time";

export type HourRow = {
  hour: number; // 0..23, UB time
  session: string;
  n: number;
  upPct: number | null; // all days
  nCond: number;
  upPctCond: number | null; // only candles that started in the same regime as now
  avgMove: number | null; // mean |close − open| in USD
};

export const MIN_SAMPLE = 30;
export const LOOKBACK_DAYS = 183;

/**
 * Per-UB-hour statistics from 1h candles of the last 183 days.
 * Regime = previous close above its EMA50 (up) or not (down); the current regime is taken
 * from the newest candle's close, i.e. the regime the next hour starts in.
 */
export function hourlyTable(h1: Candle[], now: Date): HourRow[] {
  const closes = h1.map((c) => c.close);
  const e50 = ema(closes, 50);
  const last = h1.length - 1;
  const currentUp = last >= 0 && !Number.isNaN(e50[last]) ? closes[last] > e50[last] : null;
  const from = now.getTime() - LOOKBACK_DAYS * 864e5;

  const acc = Array.from({ length: 24 }, () => ({ n: 0, up: 0, move: 0, nCond: 0, upCond: 0 }));
  for (let i = 0; i <= last; i++) {
    const c = h1[i];
    const t = c.time.getTime();
    if (t < from || t > now.getTime()) continue;
    const a = acc[ubHour(c.time)];
    const up = c.close > c.open;
    a.n++;
    a.move += Math.abs(c.close - c.open);
    if (up) a.up++;
    if (currentUp !== null && i > 0 && !Number.isNaN(e50[i - 1])) {
      const regimeUp = closes[i - 1] > e50[i - 1];
      if (regimeUp === currentUp) {
        a.nCond++;
        if (up) a.upCond++;
      }
    }
  }
  return acc.map((a, hour) => ({
    hour,
    session: sessionOfUbHour(hour),
    n: a.n,
    upPct: a.n >= MIN_SAMPLE ? Math.round((a.up / a.n) * 100) : null,
    nCond: a.nCond,
    upPctCond: a.nCond >= MIN_SAMPLE ? Math.round((a.upCond / a.nCond) * 100) : null,
    avgMove: a.n > 0 ? a.move / a.n : null,
  }));
}
