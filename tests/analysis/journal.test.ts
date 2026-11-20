import { tradePnl, tradeR, performance, type TradeInput } from "@/lib/analysis/journal";

const t = (o: Partial<TradeInput>): TradeInput => ({ direction: "BUY", lots: 0.1, entryPrice: 4100, exitPrice: 4110,
  stopLoss: 4095, openedAt: new Date("2026-11-20T07:00:00Z"), closedAt: new Date("2026-11-20T08:00:00Z"), ...o });

test("pnl and R", () => {
  expect(tradePnl(t({}))).toBeCloseTo(100);
  expect(tradeR(t({}))).toBeCloseTo(2);
  expect(tradePnl(t({ direction: "SELL" }))).toBeCloseTo(-100);
  expect(tradePnl(t({ exitPrice: null, closedAt: null }))).toBeNull();
  expect(tradeR(t({ stopLoss: null }))).toBeNull();
  expect(tradeR(t({ stopLoss: 4100 }))).toBeNull();
});
test("performance stats", () => {
  const p = performance([
    t({ closedAt: new Date("2026-11-20T08:00:00Z") }),
    t({ exitPrice: 4095, closedAt: new Date("2026-11-20T09:00:00Z") }),
    t({ exitPrice: 4090, closedAt: new Date("2026-11-20T10:00:00Z"), stopLoss: null }),
    t({ exitPrice: null, closedAt: null }),
  ]);
  expect(p.count).toBe(3);
  expect(p.winRate).toBeCloseTo(33.33, 1);
  expect(p.totalPnl).toBeCloseTo(-50);
  expect(p.profitFactor).toBeCloseTo(100 / 150);
  expect(p.avgR).toBeCloseTo((2 + -1) / 2);
  expect(p.maxDrawdown).toBeCloseTo(150);
  expect(p.equity.map((e) => e.value)).toEqual([100, 50, -50]);
  expect(p.byHour[15].count).toBe(3);
  expect(p.byWeekday[5].count).toBe(3); // Friday
  expect(p.bySession["Лондон"].pnl).toBeCloseTo(-50);
});
test("no losses and no trades do not divide by zero", () => {
  expect(performance([t({})]).profitFactor).toBeNull();
  expect(performance([])).toMatchObject({ count: 0, winRate: null, avgR: null, maxDrawdown: 0, totalPnl: 0 });
});
