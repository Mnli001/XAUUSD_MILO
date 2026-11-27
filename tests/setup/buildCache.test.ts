import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Candle, Timeframe } from "@/lib/analysis/indicators";
import { resetDb } from "../helpers/db";

// Count the heavy loads: getSetupsCached reads the 15-minute candles once per computation.
const prices = vi.hoisted(() => ({ loads: [] as string[], fail: false }));
// (the replayed records read candles too, but only once per six hours: a reading is the 700-bar 15-minute load)
vi.mock("@/lib/ingest/prices", async (orig) => {
  const real = await orig<typeof import("@/lib/ingest/prices")>();
  return { ...real, loadCandles: (...a: Parameters<typeof real.loadCandles>) => { prices.loads.push(`${a[1]}:${a[2]}`); if (prices.fail) { prices.fail = false; return Promise.reject(new Error("db down")); } return real.loadCandles(...a); } };
});

import { clearSetupCache, getSetups, getSetupsCached } from "@/lib/setup/build";
import { upsertCandles, SYMBOL } from "@/lib/ingest/prices";
import { viewer } from "@/lib/viewer";

const TTL = 60_000;
const now = new Date(Date.UTC(2026, 10, 24, 9, 1)); // a Tuesday, a minute after a 15-minute bar closed
const computations = () => prices.loads.filter((x) => x === "15min:700").length;

function series(stepMin: number, n: number, end: number): Candle[] {
  let p = 3000;
  return Array.from({ length: n }, (_, k) => {
    const o = p, c = o + 0.3;
    p = c;
    return { time: new Date(end - (n - k) * stepMin * 6e4), open: o, high: c + 1, low: o - 1, close: c };
  });
}
async function seed(endMs: number) {
  for (const [tf, step, n] of [["1day", 1440, 300], ["4h", 240, 600], ["15min", 15, 400]] as [Timeframe, number, number][]) {
    await upsertCandles(SYMBOL, tf, series(step, n, Math.floor(endMs / (step * 6e4)) * step * 6e4 + step * 6e4));
  }
}

beforeEach(async () => { await resetDb(); clearSetupCache(); prices.loads.length = 0; });

describe("getSetupsCached", () => {
  it("computes once within a bar, shares it between callers and viewers, and recomputes for a new bar", async () => {
    await seed(now.getTime() - 15 * 6e4);
    const mn = viewer({ locale: "mn", timeZone: "Asia/Ulaanbaatar" });
    const en = viewer({ locale: "en", timeZone: "Europe/London" });

    const [a, b] = await Promise.all([getSetupsCached(now, mn, TTL), getSetupsCached(new Date(now.getTime() + 5_000), en, TTL)]);
    const c = await getSetupsCached(new Date(now.getTime() + 30_000), mn, TTL);
    expect(computations()).toBe(1);
    // the kept part is shared, the wording is each viewer's own
    expect(b.candles).toBe(a.candles);
    expect(c.lastCandleAt).toEqual(a.lastCandleAt);
    expect(a.setups[0].name).toBe("Азийн хүрээний breakout");
    expect(b.setups[0].name).toBe("Asian range breakout");
    expect(b.setups[0].rule).toMatch(/^The highest and lowest price/);
    expect(b.setups[0].rule).not.toBe(a.setups[0].rule);

    // a new 15-minute bar is stored: the next call recomputes at once, well inside the TTL
    const newest = a.lastCandleAt!.getTime() + 15 * 6e4;
    await upsertCandles(SYMBOL, "15min", [{ time: new Date(newest), open: 3200, high: 3201, low: 3199, close: 3200 }]);
    const d = await getSetupsCached(new Date(now.getTime() + 40_000), mn, TTL);
    expect(computations()).toBe(2);
    expect(d.lastCandleAt!.getTime()).toBe(newest);

    // and once the TTL is up, it is read again even without a new bar
    await getSetupsCached(new Date(now.getTime() + 40_000 + TTL), mn, TTL);
    expect(computations()).toBe(3);
  });

  it("matches the uncached reading", async () => {
    await seed(now.getTime() - 15 * 6e4);
    const en = viewer({ locale: "en", timeZone: "Asia/Ulaanbaatar" });
    const fresh = await getSetups(now, en);
    const kept = await getSetupsCached(now, en, TTL);
    expect(JSON.parse(JSON.stringify(kept))).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it("does not keep a failed load", async () => {
    await seed(now.getTime() - 15 * 6e4);
    prices.fail = true;
    await expect(getSetupsCached(now, undefined, TTL)).rejects.toThrow("db down");
    expect((await getSetupsCached(now, undefined, TTL)).setups).toHaveLength(3);
  });
});
