import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers/db";
import { upsertCandles, SYMBOL } from "@/lib/ingest/prices";
import { loadChartCandles, clearChartCache, PROVIDER_TTL_MS } from "@/lib/chartCandles";
import type { Candle } from "@/lib/analysis/indicators";

const M = 6e4;
const bar = (ms: number, close = 100): Candle => ({ time: new Date(ms), open: close, high: close + 1, low: close - 1, close });
const now = new Date("2026-11-26T10:30:00Z");

beforeEach(async () => { await resetDb(); clearChartCache(); });

describe("loadChartCandles", () => {
  it("M30 is built from the stored M15", async () => {
    const t0 = Date.parse("2026-11-26T09:00:00Z");
    await upsertCandles(SYMBOL, "15min", [0, 1, 2, 3].map((i) => bar(t0 + i * 15 * M, 100 + i)));
    const out = await loadChartCandles("30min", 500, now, { fetcher: null });
    expect(out.map((c) => [c.time.toISOString().slice(11, 16), c.open, c.close])).toEqual([["09:00", 100, 101], ["09:30", 102, 103]]);
  });

  it("M1 comes from the provider, kept for a few minutes, then only the newest bars are asked for and merged", async () => {
    const calls: { tf: string; size: number }[] = [];
    const t0 = Date.parse("2026-11-26T10:00:00Z");
    let tail = 30;
    const fetcher = async (tf: "1min" | "5min", size: number) => {
      calls.push({ tf, size });
      return Array.from({ length: Math.min(size, tail) }, (_, i) => bar(t0 + (tail - Math.min(size, tail) + i) * M, 100 + i));
    };
    const a = await loadChartCandles("1min", 500, now, { fetcher });
    expect(a).toHaveLength(30);
    await loadChartCandles("1min", 500, new Date(now.getTime() + 60e3), { fetcher });
    expect(calls).toHaveLength(1); // still fresh
    tail = 33; // three new minutes since
    const b = await loadChartCandles("1min", 500, new Date(now.getTime() + PROVIDER_TTL_MS["1min"] + 1), { fetcher });
    expect(calls).toHaveLength(2);
    expect(calls[1].size).toBeLessThan(500); // only the tail
    expect(b).toHaveLength(33);
    expect(new Set(b.map((c) => c.time.getTime())).size).toBe(33); // no duplicates
  });

  it("keeps showing the last good M5 if the provider fails, and says so when there is nothing to show", async () => {
    const t0 = Date.parse("2026-11-26T10:00:00Z");
    let fail = false;
    const fetcher = async () => { if (fail) throw new Error("rate limited"); return [bar(t0), bar(t0 + 5 * M)]; };
    await loadChartCandles("5min", 500, now, { fetcher });
    fail = true;
    expect(await loadChartCandles("5min", 500, new Date(now.getTime() + PROVIDER_TTL_MS["5min"] + 1), { fetcher })).toHaveLength(2);
    clearChartCache();
    await expect(loadChartCandles("5min", 500, now, { fetcher })).rejects.toThrow();
    await expect(loadChartCandles("1min", 500, now, { fetcher: null })).rejects.toThrow(/provider/);
  });
});
