import { reason, LEAN, PLAN_RR, PLAN_STOP_ATR, type Reading, type ReasoningInput } from "@/lib/analysis/reasoning";
import { atr, type Candle, type Timeframe } from "@/lib/analysis/indicators";
import { enT, mnT } from "@/lib/i18n";

const STEP: Record<Timeframe, number> = { "15min": 15 * 6e4, "1h": 36e5, "4h": 4 * 36e5, "1day": 864e5 };
const now = new Date("2026-11-24T12:00:00Z"); // 20:00 in Ulaanbaatar: the Asian range is finished

/** A steady march: each bar moves `drift`, with a small wobble so swings exist. */
function march(tf: Timeframe, n: number, drift: number, end = 4200, wobble = 1.5): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const k = n - 1 - i;
    const close = end - k * drift + Math.sin(i / 3) * Math.abs(drift) * wobble;
    const open = close - drift;
    return { time: new Date(now.getTime() - (k + 1) * STEP[tf]), open, high: Math.max(open, close) + 0.6, low: Math.min(open, close) - 0.6, close };
  });
}
const market = (drift: number, price?: number): ReasoningInput => {
  const m15 = march("15min", 300, drift / 4), h1 = march("1h", 300, drift), h4 = march("4h", 300, drift * 4), d1 = march("1day", 60, drift * 20, 4200 - drift * 20, 0); // yesterday closed one day's move ago
  return { m15, h1, h4, d1, price: price ?? m15.at(-1)!.close, now };
};
const by = (rs: Reading[], id: string) => rs.find((r) => r.id === id)!;

test("in a steady rise the trend methods say BUY and the whole leans up", () => {
  const r = reason(market(1.2), mnT);
  expect(by(r.readings, "ema-stack").verdict).toBe("BUY");
  expect(by(r.readings, "golden-cross").verdict).toBe("BUY");
  expect(by(r.readings, "ichimoku").verdict).toBe("BUY");
  expect(r.buy).toBeGreaterThan(r.sell);
  expect(r.verdict).toBe("BUY");
  expect(r.score).toBeGreaterThanOrEqual(LEAN);
});
test("in a steady fall the same methods say SELL", () => {
  const r = reason(market(-1.2), mnT);
  expect(by(r.readings, "ema-stack").verdict).toBe("SELL");
  expect(by(r.readings, "golden-cross").verdict).toBe("SELL");
  expect(by(r.readings, "ichimoku").verdict).toBe("SELL");
  expect(r.verdict).toBe("SELL");
  expect(r.score).toBeLessThanOrEqual(-LEAN);
});
test("the count adds up and every reading explains itself with numbers", () => {
  const r = reason(market(1.2), mnT);
  expect(r.buy + r.sell + r.neutral).toBe(r.readings.length);
  expect(r.readings.length).toBeGreaterThanOrEqual(12);
  expect(new Set(r.readings.map((x) => x.id)).size).toBe(r.readings.length);
  for (const x of r.readings) {
    expect(x.name.length).toBeGreaterThan(3);
    expect(x.reason.length).toBeGreaterThan(20);
    for (const l of x.levels) expect(Number.isFinite(l.price)).toBe(true);
  }
  expect(r.families.reduce((a, f) => a + f.n, 0)).toBe(r.readings.length);
});
test("reference levels are sized by the 1-hour ATR and only given when the methods lean", () => {
  const input = market(1.2);
  const r = reason(input, mnT);
  const a = atr(input.h1);
  expect(r.plan).toMatchObject({ side: "BUY", entry: input.price, rr: PLAN_RR });
  expect(r.plan!.stop).toBeCloseTo(input.price - PLAN_STOP_ATR * a, 6);
  expect(r.plan!.target).toBeCloseTo(input.price + PLAN_STOP_ATR * a * PLAN_RR, 6);
  const down = reason(market(-1.2), mnT);
  expect(down.plan!.stop).toBeGreaterThan(down.plan!.entry);
  expect(down.plan!.target).toBeLessThan(down.plan!.entry);
  // a flat market: nobody leans, so there is nothing to size
  const flat = reason(market(0.0001), mnT);
  if (flat.verdict === "NEUTRAL") expect(flat.plan).toBeNull();
});
test("RSI is read two ways: as momentum in the middle and as exhaustion at the extreme", () => {
  const r = reason(market(3), mnT); // a relentless rise: RSI pinned high
  expect(by(r.readings, "rsi-extreme").verdict).toBe("SELL");
  expect(by(r.readings, "rsi-momentum").verdict).toBe("NEUTRAL");
});
test("a price beyond the bands, the 20-bar high and yesterday's high is read by each method on its own terms", () => {
  const base = market(0.3);
  const spike = { ...base, price: base.price + 80 };
  const r = reason(spike, mnT);
  expect(by(r.readings, "bollinger").verdict).toBe("SELL"); // stretched
  expect(by(r.readings, "donchian").verdict).toBe("BUY"); // a new high
  expect(by(r.readings, "prev-day").verdict).toBe("BUY");
  expect(by(r.readings, "pivots").verdict).toBe("BUY");
});
test("the Asian range speaks only once the session is over", () => {
  const morning = { ...market(0.3), now: new Date("2026-11-24T03:00:00Z") }; // 11:00 UB
  expect(reason(morning, mnT).readings.some((x) => x.id === "asian-range")).toBe(false);
  const m15 = market(0.3).m15;
  const asia = m15.filter((c) => c.time >= new Date("2026-11-24T00:00:00Z") && c.time < new Date("2026-11-24T07:00:00Z"));
  const hi = Math.max(...asia.map((c) => c.high)), lo = Math.min(...asia.map((c) => c.low));
  expect(by(reason({ ...market(0.3), price: hi + 5 }, mnT).readings, "asian-range").verdict).toBe("BUY");
  expect(by(reason({ ...market(0.3), price: lo - 5 }, mnT).readings, "asian-range").verdict).toBe("SELL");
  expect(by(reason({ ...market(0.3), price: (hi + lo) / 2 }, mnT).readings, "asian-range").verdict).toBe("NEUTRAL");
});
test("a wick through yesterday's high that closes back under it is a sweep, read as SELL", () => {
  const base = market(0.2);
  const y = base.d1.filter((c) => c.time < new Date("2026-11-24T00:00:00Z")).at(-1)!;
  const m15 = base.m15.map((c) => ({ ...c, open: y.high - 6, high: y.high - 4, low: y.high - 8, close: y.high - 5 }));
  m15[m15.length - 5] = { ...m15[m15.length - 5], high: y.high + 4, close: y.high - 3 };
  const r = reason({ ...base, m15, price: y.high - 5 }, mnT);
  expect(by(r.readings, "sweep").verdict).toBe("SELL");
  expect(by(r.readings, "sweep").reason).toContain(y.high.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
});
test("an unfilled three-candle gap below price is read as demand", () => {
  const base = market(0.2);
  const m15 = base.m15.map((c) => ({ ...c, open: 4100, high: 4101, low: 4099, close: 4100 }));
  const i = m15.length - 10;
  m15[i - 2] = { ...m15[i - 2], high: 4101 };
  m15[i - 1] = { ...m15[i - 1], open: 4101, high: 4112, low: 4100.5, close: 4111 };
  for (let k = i; k < m15.length; k++) m15[k] = { ...m15[k], open: 4111, high: 4113, low: 4108, close: 4111 };
  const r = by(reason({ ...base, m15, price: 4111 }, mnT).readings, "fvg");
  expect(r.verdict).toBe("BUY");
  expect(r.levels.map((l) => l.price)).toEqual([4108, 4101]);
});
test("too little history gives fewer readings rather than made-up ones", () => {
  const thin: ReasoningInput = { m15: march("15min", 10, 0.1), h1: march("1h", 10, 0.5), h4: march("4h", 10, 2), d1: [], price: 4200, now };
  const r = reason(thin, mnT);
  expect(r.readings).toEqual([]);
  expect(r).toMatchObject({ buy: 0, sell: 0, neutral: 0, verdict: "NEUTRAL", score: 0, plan: null });
});
test("the reading comes in the reader's language", () => {
  const mn = reason(market(1.2), mnT), en = reason(market(1.2), enT);
  expect(by(mn.readings, "ema-stack").reason).toMatch(/[А-я]/);
  expect(by(en.readings, "ema-stack").reason).not.toMatch(/[А-яӨөҮү]/);
  expect(en.families[0].name).toBe("Trend following");
});
