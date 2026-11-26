import type { Candle } from "./analysis/indicators";
import { loadCandles, SYMBOL } from "./ingest/prices";
import { CHART_TF_MS, SOURCE, aggregate, type ChartTf } from "./chartTf";
import { TwelveData } from "./data/twelveData";

/**
 * Candles for the chart, any of M1…W1. Stored timeframes come from the database, M30 and W1 are built from
 * stored M15 and D1, and M1/M5 are asked from the price provider. Those two are kept for a few minutes and then
 * only the newest bars are asked for, so even a chart left open all day stays inside the free plan's 800
 * requests (5-minute M1 refresh 288/day + 15-minute M5 96/day, next to the 360 the regular jobs use).
 * Between refreshes the live MT5 price keeps the last bar moving and opens new ones in the browser.
 */
export type Fetcher = (tf: "1min" | "5min", outputsize: number) => Promise<Candle[]>;
export const PROVIDER_TTL_MS: Record<"1min" | "5min", number> = { "1min": 5 * 6e4, "5min": 15 * 6e4 };
const MAX_KEEP = 1000;

const cache = new Map<"1min" | "5min", { bars: Candle[]; at: number }>();
export const clearChartCache = () => cache.clear();

function defaultFetcher(): Fetcher | null {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) return null;
  const td = new TwelveData(key);
  return (tf, outputsize) => td.fetchCandles(SYMBOL, tf, { outputsize });
}

function merge(old: Candle[], fresh: Candle[]): Candle[] {
  const byTime = new Map(old.map((c) => [c.time.getTime(), c]));
  for (const c of fresh) byTime.set(c.time.getTime(), c);
  return [...byTime.values()].sort((a, b) => a.time.getTime() - b.time.getTime()).slice(-MAX_KEEP);
}

async function fromProvider(tf: "1min" | "5min", limit: number, now: Date, fetcher: Fetcher | null): Promise<Candle[]> {
  const hit = cache.get(tf);
  if (hit && now.getTime() - hit.at < PROVIDER_TTL_MS[tf]) return hit.bars.slice(-limit);
  if (!fetcher) throw new Error("no price provider for M1/M5 (TWELVEDATA_API_KEY)");
  try {
    // With bars in hand, only the gap since the last one (plus a little overlap) is asked for.
    const size = hit ? Math.min(limit, Math.ceil((now.getTime() - hit.bars.at(-1)!.time.getTime()) / CHART_TF_MS[tf]) + 3) : Math.min(limit, MAX_KEEP);
    const bars = merge(hit?.bars ?? [], await fetcher(tf, Math.max(size, 3)));
    cache.set(tf, { bars, at: now.getTime() });
    return bars.slice(-limit);
  } catch (e) {
    if (hit) { cache.set(tf, { bars: hit.bars, at: now.getTime() - PROVIDER_TTL_MS[tf] + 6e4 }); return hit.bars.slice(-limit); } // stale, try again in a minute
    throw e;
  }
}

export async function loadChartCandles(tf: ChartTf, limit: number, now: Date, deps: { fetcher?: Fetcher | null } = {}): Promise<Candle[]> {
  const src = SOURCE[tf];
  if ("stored" in src) return loadCandles(SYMBOL, src.stored, limit);
  if ("from" in src) {
    const ratio = Math.ceil(CHART_TF_MS[tf] / CHART_TF_MS[src.from as ChartTf]);
    return aggregate(await loadCandles(SYMBOL, src.from, Math.min(limit * ratio + ratio, 5000)), tf).slice(-limit);
  }
  return fromProvider(tf as "1min" | "5min", limit, now, deps.fetcher === undefined ? defaultFetcher() : deps.fetcher);
}
