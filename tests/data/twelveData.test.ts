import { TwelveData } from "@/lib/data/twelveData";
import { ProviderError } from "@/lib/data/priceProvider";
import { stubFetch, lastFetchUrl } from "../helpers/fetch";

afterEach(() => vi.unstubAllGlobals());

test("parses values oldest-first as numbers and UTC dates", async () => {
  stubFetch(200, { status: "ok", values: [
    { datetime: "2026-11-20 10:00:00", open: "4100.1", high: "4105", low: "4098", close: "4103.5" },
    { datetime: "2026-11-20 09:00:00", open: "4095", high: "4101", low: "4094", close: "4100.1" } ] });
  const r = await new TwelveData("k").fetchCandles("XAUUSD", "1h", { outputsize: 2 });
  expect(r[0].time.toISOString()).toBe("2026-11-20T09:00:00.000Z");
  expect(r[1].close).toBe(4103.5);
  expect(lastFetchUrl()).toContain("symbol=XAU%2FUSD");
});
test("daily candles come as bare dates", async () => {
  stubFetch(200, { status: "ok", values: [{ datetime: "2026-11-19", open: "1", high: "2", low: "0.5", close: "1.5" }] });
  const r = await new TwelveData("k").fetchCandles("XAUUSD", "1day", { outputsize: 1 });
  expect(r[0].time.toISOString()).toBe("2026-11-19T00:00:00.000Z");
});
test("429 and error bodies throw ProviderError", async () => {
  stubFetch(429, { code: 429, status: "error", message: "limit" });
  await expect(new TwelveData("k").fetchCandles("XAUUSD", "1h", { outputsize: 2 })).rejects.toBeInstanceOf(ProviderError);
  stubFetch(200, { code: 400, status: "error", message: "bad symbol" });
  await expect(new TwelveData("k").fetchCandles("XAUUSD", "1h", { outputsize: 2 })).rejects.toBeInstanceOf(ProviderError);
});
test("malformed rows are rejected, not stored as NaN", async () => {
  stubFetch(200, { status: "ok", values: [{ datetime: "2026-11-19 10:00:00", open: "x", high: "2", low: "1", close: "1.5" }] });
  await expect(new TwelveData("k").fetchCandles("XAUUSD", "1h", { outputsize: 1 })).rejects.toBeInstanceOf(ProviderError);
});
