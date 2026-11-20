import { db, schema } from "@/lib/db";
import type { Candle, Timeframe } from "@/lib/analysis/indicators";
import type { PriceProvider } from "@/lib/data/priceProvider";

const STEP: Record<Timeframe, number> = { "15min": 15 * 6e4, "1h": 36e5, "4h": 4 * 36e5, "1day": 864e5 };

export function makeCandles(tf: Timeframe, n: number, lastAt = new Date("2026-11-20T10:00:00Z"), drift = 0.5): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const base = 4000 + i * drift + Math.sin(i / 4) * 3;
    return { time: new Date(lastAt.getTime() - (n - 1 - i) * STEP[tf]), open: base, high: base + 2, low: base - 2, close: base + drift };
  });
}

export async function seedCandles(tf: Timeframe, n: number, opts: { lastAt?: Date } = {}) {
  const rows = makeCandles(tf, n, opts.lastAt).map((c) => ({ ...c, symbol: "XAUUSD", timeframe: tf }));
  for (let i = 0; i < rows.length; i += 1000) await db.insert(schema.candles).values(rows.slice(i, i + 1000));
}

export function fakeProvider(n: number, lastAt?: Date): PriceProvider {
  return { fetchCandles: async (_s, tf) => makeCandles(tf, n, lastAt) };
}
