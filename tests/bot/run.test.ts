import { runBacktestFromDb, paramsFromQuery } from "@/lib/bot/run";
import { DEFAULT_PARAMS } from "@/lib/bot/strategy";
import { resetDb } from "../helpers/db";
import { seedCandles } from "../helpers/candles";

beforeEach(resetDb);

test("an empty database gives an empty result instead of failing", async () => {
  expect(await runBacktestFromDb()).toMatchObject({ trades: [], verdict: "INSUFFICIENT", from: null });
});
test("runs over stored candles", async () => {
  await seedCandles("15min", 3000);
  await seedCandles("1h", 900);
  await seedCandles("4h", 300);
  await seedCandles("1day", 300);
  const r = await runBacktestFromDb();
  expect(r.to).not.toBeNull();
  expect(r.finalBalance).toBeCloseTo(10_000 + r.trades.reduce((a, t) => a + t.pnl, 0), 6);
});
test("query parameters fall back to defaults and are clamped", () => {
  expect(paramsFromQuery({})).toEqual({ params: DEFAULT_PARAMS, startBalance: 10_000 });
  const { params, startBalance } = paramsFromQuery({ riskPct: "50", rr: "abc", minBias: "55", maxTradesPerDay: "3.9", startBalance: "5000", spread: "" });
  expect(params.riskPct).toBe(5);       // clamped
  expect(params.rr).toBe(2);            // not a number → default
  expect(params.minBias).toBe(55);
  expect(params.maxTradesPerDay).toBe(3);
  expect(params.spread).toBe(0.3);      // blank → default
  expect(startBalance).toBe(5000);
});
