import { asianSetup, historyOf, MIN_HISTORY } from "@/lib/setup/setups";
import type { Candle } from "@/lib/analysis/indicators";

const M15 = 15 * 6e4;
/** 15-minute bars for one UTC day (a Tuesday), flat at `base` unless a bar is overridden. */
function day(overrides: Record<number, Partial<Candle>> = {}, upToBar = 96, base = 4000): Candle[] {
  const start = Date.UTC(2026, 10, 24, 0, 0);
  return Array.from({ length: upToBar }, (_, i) => ({ time: new Date(start + i * M15), open: base, high: base + 2, low: base - 2, close: base, ...overrides[i] }));
}
const UP = { daily: 30, h4: 20 }, DOWN = { daily: -30, h4: -20 };
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 24, h, m));
/** Bars from `from` on held around `price` (±2), so a trade opened before them neither stops nor targets. */
const hold = (from: number, to: number, price: number) => Object.fromEntries(Array.from({ length: to - from }, (_, k) => [from + k, { open: price, high: price + 2, low: price - 2, close: price }]));

describe("Asian range breakout", () => {
  test("before 07:00 UTC the range is still forming", () => {
    const s = asianSetup(day({}, 12), UP, [], at(3));
    expect(s.status).toBe("FORMING");
    expect(s.band).toEqual({ high: 4002, low: 3998 });
    expect(s.entry).toBeNull();
  });
  test("after the range, with an up trend, it waits for a close above the high", () => {
    const s = asianSetup(day({}, 32), UP, [], at(8));
    expect(s).toMatchObject({ status: "WATCH", side: "BUY", entry: 4002, stop: 4000, target: 4008 });
    expect(asianSetup(day({}, 32), DOWN, [], at(8))).toMatchObject({ status: "WATCH", side: "SELL", entry: 3998, stop: 4000, target: 3992 });
  });
  test("the 4-hour trend must agree with the daily", () => {
    expect(asianSetup(day({}, 32), { daily: 30, h4: -20 }, [], at(8))).toMatchObject({ status: "OFF", side: null });
    expect(asianSetup(day({}, 32), { daily: 30, h4: null }, [], at(8)).status).toBe("OFF");
  });
  test("without a daily trend there is nothing to wait for", () => {
    expect(asianSetup(day({}, 32), { daily: null, h4: 20 }, [], at(8))).toMatchObject({ status: "OFF", side: null, entry: null });
    expect(asianSetup(day({}, 32), { daily: 0, h4: 0 }, [], at(8)).status).toBe("OFF");
  });
  test("a close outside the range in the trend's direction is the entry: stop at the middle, target three times as far", () => {
    const bars = day({ ...hold(31, 96, 4006), 30: { high: 4007, close: 4006 } }, 34);
    expect(asianSetup(bars, UP, [], at(8, 30))).toMatchObject({ status: "ACTIVE", side: "BUY", entry: 4006, stop: 4000, target: 4024 });
  });
  test("a close outside the range against the trend is not the entry: the rule keeps waiting for the trend's side", () => {
    const bars = day({ 30: { low: 3993, close: 3994 } }, 34); // closed below the range while the daily trend is up
    expect(asianSetup(bars, UP, [], at(8, 30))).toMatchObject({ status: "WATCH", side: "BUY", entry: 4002 });
    const later = day({ ...hold(41, 96, 4006), 30: { low: 3993, close: 3994 }, 40: { high: 4007, close: 4006 } }, 44);
    expect(asianSetup(later, UP, [], at(11))).toMatchObject({ status: "ACTIVE", side: "BUY", entry: 4006 });
  });
  test("a breakout inside a news window is passed over, and the next close outside the range after it is taken", () => {
    const bars = day({ 30: { high: 4007, close: 4006 } }, 34);
    expect(asianSetup(bars, UP, [at(7, 45)], at(8, 30))).toMatchObject({ status: "WATCH", side: "BUY" });
    const later = day({ ...hold(37, 96, 4008), 30: { high: 4007, close: 4006 }, 36: { high: 4009, close: 4008 } }, 40); // 09:00 bar closes 09:15, past the 60 minutes
    expect(asianSetup(later, UP, [at(7, 45)], at(10))).toMatchObject({ status: "ACTIVE", side: "BUY", entry: 4008, stop: 4000, target: 4032 });
  });
  test("the window closes at 16:00 UTC and a trade is flat by 20:00 UTC", () => {
    expect(asianSetup(day({}, 70), UP, [], at(17)).status).toBe("OFF");
    const bars = day({ ...hold(31, 96, 4006), 30: { high: 4007, close: 4006 } }, 90);
    expect(asianSetup(bars, UP, [], at(19)).status).toBe("ACTIVE");
    const flat = asianSetup(bars, UP, [], at(21));
    expect(flat).toMatchObject({ status: "OFF", side: "BUY", entry: 4006, result: 0 }); // closed on time at the entry price
  });
  test("a trade that reached its stop or target today is shown as finished, not active, with its result", () => {
    const stopped = day({ ...hold(31, 96, 4006), 30: { high: 4007, close: 4006 }, 33: { low: 3999, close: 4001 } }, 40);
    expect(asianSetup(stopped, UP, [], at(10))).toMatchObject({ status: "OFF", side: "BUY", entry: 4006, stop: 4000, target: 4024, result: -1 });
    const won = day({ ...hold(31, 96, 4006), 30: { high: 4007, close: 4006 }, 35: { high: 4025, low: 4010, close: 4023 } }, 40);
    const s = asianSetup(won, UP, [], at(10));
    expect(s).toMatchObject({ status: "OFF", result: 3 });
    expect(s.headline).toContain("target");
    // a bar touching both counts as the stop, as in the replay
    const both = day({ ...hold(31, 96, 4006), 30: { high: 4007, close: 4006 }, 35: { high: 4025, low: 3999, close: 4006 } }, 40);
    expect(asianSetup(both, UP, [], at(10)).result).toBe(-1);
  });
  test("when prices stop arriving it says so instead of reading old bars", () => {
    const s = asianSetup(day({}, 40), UP, [], at(15)); // last bar closed 10:00, five hours ago
    expect(s).toMatchObject({ status: "OFF", stale: true });
    expect(s.headline).toContain("хоцорч");
  });
  test("too few bars in the range, or a weekend, gives nothing", () => {
    const thin = day({}, 40).filter((_, i) => i >= 20); // only 8 range bars
    expect(asianSetup(thin, UP, [], at(9)).status).toBe("OFF");
    expect(asianSetup(day({}, 40), UP, [], new Date(Date.UTC(2026, 10, 22, 9))).status).toBe("OFF"); // Sunday
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
