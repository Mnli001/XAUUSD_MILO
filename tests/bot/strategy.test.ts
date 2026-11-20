import { DEFAULT_PARAMS, inSession, inNewsWindow, directionFromScores, pullbackSignal, scoreSeries } from "@/lib/bot/strategy";
import { timeframeScore } from "@/lib/analysis/bias";
import { atr, atrSeries } from "@/lib/analysis/indicators";
import { makeCandles } from "../helpers/candles";

const p = DEFAULT_PARAMS;
const ub = (hhmm: string) => new Date(new Date(`2026-11-18T${hhmm}:00Z`).getTime() - 8 * 36e5);

test("default parameters match the approved rules", () => {
  expect(p).toMatchObject({ minBias: 40, sessionStartUb: 15, sessionEndUb: 1, atrMult: 1.5, rr: 2, riskPct: 0.5, maxTradesPerDay: 2, dailyLossPct: 1, maxDrawdownPct: 5, newsBeforeMin: 30, newsAfterMin: 60 });
});
test("session is 15:00–01:00 UB, wrapping midnight", () => {
  expect(inSession(ub("16:00"), p)).toBe(true);
  expect(inSession(ub("15:00"), p)).toBe(true);
  expect(inSession(ub("00:30"), p)).toBe(true);
  expect(inSession(ub("01:00"), p)).toBe(false);
  expect(inSession(ub("10:00"), p)).toBe(false);
  expect(inSession(ub("14:59"), p)).toBe(false);
});
test("news window is 30 minutes before to 60 minutes after", () => {
  const news = [new Date("2026-11-18T13:30:00Z")];
  expect(inNewsWindow(new Date("2026-11-18T12:59:00Z"), news, p)).toBe(false);
  expect(inNewsWindow(new Date("2026-11-18T13:00:00Z"), news, p)).toBe(true);
  expect(inNewsWindow(new Date("2026-11-18T14:30:00Z"), news, p)).toBe(true);
  expect(inNewsWindow(new Date("2026-11-18T14:31:00Z"), news, p)).toBe(false);
  expect(inNewsWindow(new Date("2026-11-18T13:30:00Z"), [], p)).toBe(false);
});
test("direction needs a strong total and agreeing daily and 4h scores", () => {
  expect(directionFromScores({ "1day": 60, "4h": 50, "1h": 40, "15min": 30 }, p)).toBe("BUY");   // total 48.5
  expect(directionFromScores({ "1day": -60, "4h": -50, "1h": -40, "15min": -30 }, p)).toBe("SELL");
  expect(directionFromScores({ "1day": 30, "4h": 30, "1h": 30, "15min": 30 }, p)).toBeNull();     // total 30
  expect(directionFromScores({ "1day": -10, "4h": 100, "1h": 100, "15min": 100 }, p)).toBeNull(); // daily disagrees
  expect(directionFromScores({ "1day": null, "4h": 100, "1h": 100, "15min": 100 }, p)).toBeNull(); // no daily score
});
test("pullback: touches EMA20 and closes back in the trend direction", () => {
  const bar = (o: number, h: number, l: number, c: number) => ({ time: new Date(0), open: o, high: h, low: l, close: c });
  expect(pullbackSignal(bar(101, 103, 99, 102), 100, "BUY")).toBe(true);
  expect(pullbackSignal(bar(103, 104, 101, 103.5), 100, "BUY")).toBe(false); // never touched
  expect(pullbackSignal(bar(101, 102, 98, 99), 100, "BUY")).toBe(false);     // closed below
  expect(pullbackSignal(bar(99, 101, 97, 98), 100, "SELL")).toBe(true);
  expect(pullbackSignal(bar(99, 99.5, 97, 98), 100, "SELL")).toBe(false);
});
test("scoreSeries equals timeframeScore on every prefix (no look-ahead)", () => {
  const cs = makeCandles("1h", 320);
  const series = scoreSeries(cs);
  expect(series).toHaveLength(320);
  expect(series[208]).toBeNull();
  for (const i of [209, 230, 275, 319]) expect(series[i]).toBeCloseTo(timeframeScore(cs.slice(0, i + 1))!, 8);
});
test("atrSeries ends at the same value as atr and is NaN before it is defined", () => {
  const cs = makeCandles("15min", 60);
  const s = atrSeries(cs);
  expect(s.at(-1)).toBeCloseTo(atr(cs), 10);
  expect(Number.isNaN(s[13])).toBe(true);
  expect(Number.isNaN(s[14])).toBe(false);
});
