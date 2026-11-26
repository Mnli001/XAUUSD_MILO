import { simulateOrders, type Order } from "@/lib/bot/backtest";
import { asianRangeOrders, dipOrders, newsOrders, IDEAS, compareIdeas } from "@/lib/bot/ideas";
import { DEFAULT_PARAMS } from "@/lib/bot/strategy";
import type { Candle } from "@/lib/analysis/indicators";

const P = { ...DEFAULT_PARAMS, spread: 0, breakeven: false };
const TUE = Date.UTC(2026, 10, 17, 0, 0); // Tuesday 00:00 UTC
const bar = (i: number, o: number, h: number, l: number, c: number, base = TUE): Candle => ({ time: new Date(base + i * 9e5), open: o, high: h, low: l, close: c });
const flat = (i: number, base = TUE) => bar(i, 4000, 4001, 3999, 4000, base);

test("orders carry their own stop, target and time limit", () => {
  const bars = [flat(32), bar(33, 4000, 4002, 3999, 4001), bar(34, 4001, 4011, 4000, 4010), flat(35)];
  const orders: (Order | null)[] = [{ side: "BUY", stopDist: 5, targetDist: 10 }, null, null, null];
  const r = simulateOrders(bars, orders, P, 10_000);
  expect(r.trades[0]).toMatchObject({ entryPrice: 4000, stopLoss: 3995, exitPrice: 4010, reason: "TP", lots: 0.1 });
  expect(r.trades[0].r).toBeCloseTo(2);
});
test("a position is closed at the open once its time limit is reached", () => {
  const bars = [flat(32), bar(33, 4000, 4002, 3999, 4001), bar(34, 4001, 4003, 4000, 4002), bar(35, 4002.5, 4004, 4001, 4003), flat(36)];
  const r = simulateOrders(bars, [{ side: "BUY", stopDist: 5, targetDist: 10, maxBars: 2 }, null, null, null, null], P, 10_000);
  expect(r.trades[0]).toMatchObject({ reason: "TIME", exitPrice: 4002.5 });
});

// Asian range 3995–4005 (00:00–07:00 UTC), then a London breakout
const asia = Array.from({ length: 28 }, (_, i) => bar(i, 4000, 4005, 3995, 4000));
test("Asian range breakout: first close beyond the range, stop at the middle, flat by 20:00 UTC", () => {
  const bars = [...asia, bar(28, 4000, 4004, 3999, 4003), bar(29, 4003, 4009, 4002, 4008), bar(30, 4008, 4012, 4007, 4011)];
  const orders = asianRangeOrders(bars, { rr: 2, news: [], params: P });
  expect(orders.slice(0, 29).every((o) => o === null)).toBe(true);
  expect(orders[29]).toEqual({ side: "BUY", stopDist: 8, targetDist: 16, maxBars: 50 }); // decided 07:30 → 12.5 h to 20:00
  expect(orders[30]).toBeNull(); // one trade per day
});
test("Asian range breakout: downside, trend filter and news window", () => {
  const down = [...asia, bar(28, 4000, 4001, 3990, 3992)];
  expect(asianRangeOrders(down, { rr: 2, news: [], params: P })[28]).toMatchObject({ side: "SELL", stopDist: 8 });
  const trend = down.map(() => 30 as number | null);
  expect(asianRangeOrders(down, { rr: 2, news: [], params: P, trend })[28]).toBeNull(); // daily trend is up
  expect(asianRangeOrders(down, { rr: 2, news: [new Date(TUE + 29 * 9e5)], params: P })[28]).toBeNull();
});
test("Asian range breakout: nothing before the range is complete or outside 07:00–16:00 UTC", () => {
  const early = [...asia.slice(0, 10), bar(10, 4000, 4010, 3999, 4009)];
  expect(asianRangeOrders(early, { rr: 2, news: [], params: P }).every((o) => o === null)).toBe(true);
  const late = [...asia, ...Array.from({ length: 36 }, (_, k) => flat(28 + k)), bar(64, 4000, 4010, 3999, 4009)]; // 16:00 UTC
  expect(asianRangeOrders(late, { rr: 2, news: [], params: P }).every((o) => o === null)).toBe(true);
});

test("dip buying: oversold in an uptrend, overbought in a downtrend", () => {
  const bars = [flat(40), flat(41), flat(42), flat(43)];
  const base = { atr15: [4, 4, 4, 4], news: [], params: P, rsiLow: 30 };
  expect(dipOrders(bars, { ...base, rsi15: [25, 50, 75, 25], daily: [50, 50, 50, -50], h4: [50, 50, 50, -50] }))
    .toEqual([{ side: "BUY", stopDist: 8, targetDist: 6, maxBars: 32 }, null, null, null]);
  expect(dipOrders(bars, { ...base, rsi15: [25, 50, 75, 25], daily: [-50, -50, -50, 50], h4: [-50, -50, -50, null] })[2]).toMatchObject({ side: "SELL" });
  expect(dipOrders(bars, { ...base, rsi15: [25, 50, 50, 50], daily: [50, 50, 50, 50], h4: [-5, 50, 50, 50] })[0]).toBeNull(); // 4h disagrees
  expect(dipOrders(bars, { ...base, rsi15: [25, 50, 50, 50], daily: [50, 50, 50, 50], h4: [50, 50, 50, 50], news: [new Date(TUE + 41 * 9e5)] })[0]).toBeNull();
  expect(dipOrders(bars, { ...base, atr15: [NaN, 4, 4, 4], rsi15: [25, 50, 50, 50], daily: [50, 50, 50, 50], h4: [50, 50, 50, 50] })[0]).toBeNull();
});

test("news momentum: follow a release bar that moved at least one ATR", () => {
  const n = new Date(TUE + 54 * 9e5); // 13:30 UTC
  const bars = [flat(53), bar(54, 4000, 4011, 3998, 4010), flat(55)];
  expect(newsOrders(bars, { atr15: [4, 4, 4], news: [n], rr: 2 })).toEqual([null, { side: "BUY", stopDist: 12, targetDist: 24, maxBars: 8 }, null]);
  expect(newsOrders([flat(53), bar(54, 4000, 4003, 3999, 4002), flat(55)], { atr15: [4, 4, 4], news: [n], rr: 2 })[1]).toBeNull(); // too small
  expect(newsOrders(bars, { atr15: [4, 4, 4], news: [], rr: 2 }).every((o) => o === null)).toBe(true);
  expect(newsOrders(bars, { atr15: [4, 4, 4], news: [n], rr: 1, fade: true })[1]).toEqual({ side: "SELL", stopDist: 13, targetDist: 13, maxBars: 8 });
});

test("the idea list is fixed in advance", () => {
  expect(IDEAS.map((i) => i.name)).toEqual([
    "Азийн хүрээний breakout", "Азийн хүрээний breakout + өдрийн тренд",
    "Трендийн доторх уналтыг авах (RSI 30)", "Трендийн доторх уналтыг авах (RSI 25)",
    "Мэдээний дараах хөдөлгөөнийг дагах", "Мэдээний дараах хөдөлгөөний эсрэг",
    "Азийн breakout + өдөр, 4 цагийн тренд, 3R", // added after the all-history check; earlier entries keep their places
  ]);
});
test("compareIdeas returns a train/validation row per idea", () => {
  let seed = 9;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296) - 0.5;
  const m15: Candle[] = [];
  let price = 3000;
  for (let i = 0; i < 400 * 96; i++) {
    const time = new Date(Date.UTC(2026, 0, 5) + i * 9e5);
    if (time.getUTCDay() === 6 || time.getUTCDay() === 0) continue;
    const open = price, close = open + 0.08 + rnd() * 6;
    m15.push({ time, open, high: Math.max(open, close) + Math.abs(rnd()) * 2, low: Math.min(open, close) - Math.abs(rnd()) * 2, close });
    price = close;
  }
  const agg = (ms: number) => { const out: Candle[] = []; for (const c of m15) { const t = Math.floor(c.time.getTime() / ms) * ms; const l = out.at(-1);
    if (l && l.time.getTime() === t) { l.high = Math.max(l.high, c.high); l.low = Math.min(l.low, c.low); l.close = c.close; } else out.push({ ...c, time: new Date(t) }); } return out; };
  const news = Array.from({ length: 12 }, (_, k) => new Date(Date.UTC(2026, k, 14, 13, 30))).filter((d) => d.getUTCDay() % 6 !== 0);
  const { rows, splitAt, from, to } = compareIdeas({ m15, h1: agg(36e5), h4: agg(4 * 36e5), d1: agg(864e5), news });
  expect(rows).toHaveLength(7);
  expect(from!.getTime()).toBeLessThan(splitAt!.getTime());
  expect(splitAt!.getTime()).toBeLessThan(to!.getTime());
  expect(rows[0].train.n + rows[0].test.n).toBeGreaterThan(50); // a breakout most days
  expect(rows.every((r) => Number.isFinite(r.train.totalR) && Number.isFinite(r.test.totalR))).toBe(true);
});
