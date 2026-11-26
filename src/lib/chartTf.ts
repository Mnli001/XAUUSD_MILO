import type { Candle, Timeframe } from "./analysis/indicators";

/** The chart's timeframes, as MT5 names them: M1 M5 M15 M30 H1 H4 D1 W1. */
export const CHART_TFS = ["1min", "5min", "15min", "30min", "1h", "4h", "1day", "1week"] as const;
export type ChartTf = (typeof CHART_TFS)[number];
export const isChartTf = (x: unknown): x is ChartTf => typeof x === "string" && (CHART_TFS as readonly string[]).includes(x);
export const CHART_TF_LABEL: Record<ChartTf, string> = { "1min": "M1", "5min": "M5", "15min": "M15", "30min": "M30", "1h": "H1", "4h": "H4", "1day": "D1", "1week": "W1" };

const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
export const CHART_TF_MS: Record<ChartTf, number> = { "1min": MIN, "5min": 5 * MIN, "15min": 15 * MIN, "30min": 30 * MIN, "1h": HOUR, "4h": 4 * HOUR, "1day": DAY, "1week": 7 * DAY };

/** Where each timeframe comes from: stored as is, built from a stored one, or asked from the provider. */
export const SOURCE: Record<ChartTf, { stored: Timeframe } | { from: Timeframe } | { provider: true }> = {
  "1min": { provider: true }, "5min": { provider: true },
  "15min": { stored: "15min" }, "30min": { from: "15min" }, "1h": { stored: "1h" }, "4h": { stored: "4h" },
  "1day": { stored: "1day" }, "1week": { from: "1day" },
};

/** The opening time (UTC ms) of the bar a moment belongs to. Weeks open on Monday 00:00 UTC, as in MT5. */
export function bucketStart(ms: number, tf: ChartTf): number {
  if (tf === "1week") {
    const day = Math.floor(ms / DAY) * DAY;
    const weekday = (new Date(day).getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
    return day - weekday * DAY;
  }
  const step = CHART_TF_MS[tf];
  return Math.floor(ms / step) * step;
}

/** Smaller bars merged into `tf` bars: first open, highest high, lowest low, last close. Input oldest first. */
export function aggregate(bars: readonly Candle[], tf: ChartTf): Candle[] {
  const out: Candle[] = [];
  for (const b of bars) {
    const start = bucketStart(b.time.getTime(), tf);
    const last = out.at(-1);
    if (last && last.time.getTime() === start) {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
    } else {
      out.push({ time: new Date(start), open: b.open, high: b.high, low: b.low, close: b.close });
    }
  }
  return out;
}

/**
 * The bar (opening time, ms) a moment falls in, given the bars' opening times oldest first and the bar length.
 * Null before the first bar, or later than one bar past the last (nothing drawn there yet).
 */
export function snapToBars(ms: number, opens: readonly number[], stepMs: number): number | null {
  if (opens.length === 0 || ms < opens[0]) return null;
  let lo = 0, hi = opens.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (opens[mid] <= ms) lo = mid; else hi = mid - 1;
  }
  const open = opens[lo];
  if (lo === opens.length - 1 && ms >= open + stepMs) return null;
  return open;
}
