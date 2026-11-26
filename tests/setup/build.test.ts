import { getSetups, clearSetupCache } from "@/lib/setup/build";
import { upsertCandles, SYMBOL } from "@/lib/ingest/prices";
import type { Candle, Timeframe } from "@/lib/analysis/indicators";
import { resetDb } from "../helpers/db";

const now = new Date(Date.UTC(2026, 10, 24, 9, 0)); // a Tuesday, 17:00 UB
function series(stepMin: number, n: number, drift: number): Candle[] {
  const end = Math.floor(now.getTime() / (stepMin * 6e4)) * stepMin * 6e4;
  let p = 3000, seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  return Array.from({ length: n }, (_, k) => {
    const o = p, c = o + drift + (rnd() - 0.5) * 6;
    p = c;
    return { time: new Date(end - (n - k) * stepMin * 6e4), open: o, high: Math.max(o, c) + 1, low: Math.min(o, c) - 1, close: c };
  });
}

beforeEach(async () => { await resetDb(); clearSetupCache(); });

test("with no candles every setup is off and nothing is drawn", async () => {
  const r = await getSetups(now);
  expect(r.setups).toHaveLength(3);
  expect(r.setups.every((s) => s.status === "OFF")).toBe(true);
  expect(r.candles).toHaveLength(0);
  expect(r.setups.every((s) => s.history.n === 0 && s.history.winPct === null)).toBe(true);
});
test("with history it reads both rules against the latest candles and reports each rule's own record", async () => {
  for (const [tf, step, n, drift] of [["1day", 1440, 320, 4], ["4h", 240, 1900, 0.7], ["15min", 15, 30000, 0.04]] as [Timeframe, number, number, number][]) await upsertCandles(SYMBOL, tf, series(step, n, drift));
  const r = await getSetups(now);
  expect(r.setups.map((s) => s.id)).toEqual(["asian-breakout", "ny-open-breakout", "ny-late-breakout"]);
  expect(r.candles.length).toBeGreaterThan(50);
  expect(r.candles.at(-1)!.time.getTime()).toBeLessThanOrEqual(now.getTime());
  const [asian] = r.setups;
  expect(asian.band).not.toBeNull(); // today's 00:00–07:00 UTC range exists
  expect(["WATCH", "ACTIVE", "OFF"]).toContain(asian.status);
  expect(asian.history.n).toBeGreaterThan(0);
  expect(r.lastCandleAt).not.toBeNull();
});
