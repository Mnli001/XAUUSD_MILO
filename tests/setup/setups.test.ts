import { asianSetup, dipSetup, historyOf, MIN_HISTORY } from "@/lib/setup/setups";
import type { Candle } from "@/lib/analysis/indicators";

const M15 = 15 * 6e4;
/** 15-minute bars for one UTC day (a Tuesday), flat at `base` unless a bar is overridden. */
function day(overrides: Record<number, Partial<Candle>> = {}, upToBar = 96, base = 4000): Candle[] {
  const start = Date.UTC(2026, 10, 24, 0, 0);
  return Array.from({ length: upToBar }, (_, i) => ({ time: new Date(start + i * M15), open: base, high: base + 2, low: base - 2, close: base, ...overrides[i] }));
}
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 24, h, m));

describe("Asian range breakout", () => {
  test("before 07:00 UTC the range is still forming", () => {
    const s = asianSetup(day({}, 12), 30, [], at(3));
    expect(s.status).toBe("FORMING");
    expect(s.band).toEqual({ high: 4002, low: 3998 });
    expect(s.entry).toBeNull();
  });
  test("after the range, with an up trend, it waits for a close above the high", () => {
    const s = asianSetup(day({}, 32), 30, [], at(8));
    expect(s).toMatchObject({ status: "WATCH", side: "BUY", entry: 4002, stop: 4000, target: 4006 });
    expect(asianSetup(day({}, 32), -30, [], at(8))).toMatchObject({ status: "WATCH", side: "SELL", entry: 3998, stop: 4000, target: 3994 });
  });
  test("without a daily trend there is nothing to wait for", () => {
    expect(asianSetup(day({}, 32), null, [], at(8))).toMatchObject({ status: "OFF", side: null, entry: null });
    expect(asianSetup(day({}, 32), 0, [], at(8)).status).toBe("OFF");
  });
  test("a close outside the range in the trend's direction is the entry: stop at the middle, target twice as far", () => {
    const bars = day({ 30: { high: 4007, close: 4006 } }, 34);
    expect(asianSetup(bars, 30, [], at(8, 30))).toMatchObject({ status: "ACTIVE", side: "BUY", entry: 4006, stop: 4000, target: 4018 });
  });
  test("a breakout against the trend, or during news, is skipped", () => {
    const bars = day({ 30: { high: 4007, close: 4006 } }, 34);
    expect(asianSetup(bars, -30, [], at(8, 30))).toMatchObject({ status: "OFF", entry: null });
    expect(asianSetup(bars, 30, [at(7, 45)], at(8, 30))).toMatchObject({ status: "OFF", entry: null });
  });
  test("the window closes at 16:00 UTC and a trade is flat by 20:00 UTC", () => {
    expect(asianSetup(day({}, 70), 30, [], at(17)).status).toBe("OFF");
    const bars = day({ 30: { high: 4007, close: 4006 } }, 90);
    expect(asianSetup(bars, 30, [], at(19)).status).toBe("ACTIVE");
    expect(asianSetup(bars, 30, [], at(21)).status).toBe("OFF");
  });
  test("too few bars in the range, or a weekend, gives nothing", () => {
    const thin = day({}, 40).filter((_, i) => i >= 20); // only 8 range bars
    expect(asianSetup(thin, 30, [], at(9)).status).toBe("OFF");
    expect(asianSetup(day({}, 40), 30, [], new Date(Date.UTC(2026, 10, 22, 9))).status).toBe("OFF"); // Sunday
  });
});

describe("dip in a trend", () => {
  const bars = day({}, 40);
  test("needs the daily and 4-hour trend to agree", () => {
    expect(dipSetup(bars, { rsi: 28, atr: 4, daily: 30, h4: -10 }, [], at(10))).toMatchObject({ status: "OFF", side: null });
  });
  test("waits while RSI is above the trigger, and shows where the trade would sit", () => {
    expect(dipSetup(bars, { rsi: 44, atr: 4, daily: 30, h4: 20 }, [], at(10))).toMatchObject({ status: "WATCH", side: "BUY", entry: 4000, stop: 3992, target: 4006 });
  });
  test("is active once RSI is through the trigger, for shorts too", () => {
    expect(dipSetup(bars, { rsi: 29, atr: 4, daily: 30, h4: 20 }, [], at(10))).toMatchObject({ status: "ACTIVE", side: "BUY" });
    expect(dipSetup(bars, { rsi: 72, atr: 4, daily: -30, h4: -20 }, [], at(10))).toMatchObject({ status: "ACTIVE", side: "SELL", stop: 4008, target: 3994 });
  });
  test("is off around high-impact news and when indicators are missing", () => {
    expect(dipSetup(bars, { rsi: 29, atr: 4, daily: 30, h4: 20 }, [at(10, 10)], at(10)).status).toBe("OFF");
    expect(dipSetup(bars, { rsi: NaN, atr: 4, daily: 30, h4: 20 }, [], at(10)).status).toBe("OFF");
  });
});

describe("history", () => {
  test("no percentage from a small sample", () => {
    expect(historyOf(Array.from({ length: MIN_HISTORY - 1 }, () => ({ r: 1 })))).toMatchObject({ n: MIN_HISTORY - 1, winPct: null, avgR: null });
  });
  test("win share, average R and profit factor from enough trades", () => {
    const trades = [...Array.from({ length: 20 }, () => ({ r: 2 })), ...Array.from({ length: 30 }, () => ({ r: -1 }))];
    expect(historyOf(trades)).toEqual({ n: 50, winPct: 40, avgR: 0.2, profitFactor: 40 / 30 });
  });
});
