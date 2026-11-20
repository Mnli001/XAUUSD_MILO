import { withRetry } from "@/lib/retry";
import { TwelveData } from "@/lib/data/twelveData";

afterEach(() => vi.unstubAllGlobals());

test("withRetry retries failures and returns the first success", async () => {
  let calls = 0;
  const seen: number[] = [];
  const r = await withRetry(async () => { if (++calls < 3) throw new Error("boom"); return "ok"; }, { attempts: 5, delayMs: 0, onRetry: (n) => seen.push(n) });
  expect(r).toBe("ok");
  expect(calls).toBe(3);
  expect(seen).toEqual([1, 2]);
});
test("withRetry gives up after the last attempt with the last error", async () => {
  let calls = 0;
  await expect(withRetry(async () => { calls++; throw new Error(`fail ${calls}`); }, { attempts: 3, delayMs: 0 })).rejects.toThrow("fail 3");
  expect(calls).toBe(3);
});
test("a network failure reports the underlying cause code", async () => {
  vi.stubGlobal("fetch", async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ETIMEDOUT" } }); });
  await expect(new TwelveData("k").fetchCandles("XAUUSD", "1h", { outputsize: 1 })).rejects.toThrow(/ETIMEDOUT/);
});
