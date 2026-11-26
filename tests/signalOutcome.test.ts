import { describe, it, expect } from "vitest";
import { signalOutcome, outcomeTotals, type SignalLike } from "@/lib/signalOutcome";
import type { Candle } from "@/lib/analysis/indicators";

const M15 = 15 * 6e4;
const T0 = new Date("2026-11-25T11:47:00Z"); // 19:47 УБ
const bar = (i: number, o: Partial<Candle> = {}): Candle => ({ time: new Date(Date.UTC(2026, 10, 25, 11, 45) + i * M15), open: 3510, high: 3515, low: 3505, close: 3510, ...o });
// A SELL at 3510.26, stop 3544.01, target 3442.77 (3R)
const sell: SignalLike = { setupId: "asian-breakout", side: "SELL", entry: 3510.26, stop: 3544.01, target: 3442.77, createdAt: T0 };
const buy: SignalLike = { setupId: "asian-breakout", side: "BUY", entry: 100, stop: 90, target: 130, createdAt: T0 };

describe("signalOutcome", () => {
  it("a SELL whose target is reached first is a win of its R multiple", () => {
    const bars = [bar(1), bar(2, { low: 3440 }), bar(3, { high: 3550 })];
    expect(signalOutcome(sell, bars, new Date("2026-11-25T16:00:00Z"))).toMatchObject({ kind: "WIN", r: 2, at: new Date(bars[1].time.getTime() + M15) });
  });

  it("a SELL whose stop is reached first is a loss of 1R", () => {
    const bars = [bar(1, { high: 3545 }), bar(2, { low: 3440 })];
    expect(signalOutcome(sell, bars, new Date("2026-11-25T16:00:00Z"))).toMatchObject({ kind: "LOSS", r: -1 });
  });

  it("a bar touching both counts as the stop, as the replay does", () => {
    expect(signalOutcome(buy, [bar(1, { open: 100, close: 100, low: 89, high: 131 })], new Date("2026-11-25T16:00:00Z"))).toMatchObject({ kind: "LOSS" });
  });

  it("ignores the breakout bar and anything before it, but counts the bar running when the signal was recorded", () => {
    const bars = [bar(-2, { high: 4000 }), bar(-1, { high: 4000 }), bar(0, { low: 3440 })]; // bar(0) opened 11:45, the signal was recorded 11:47
    expect(signalOutcome(sell, bars, new Date("2026-11-25T16:00:00Z"))).toMatchObject({ kind: "WIN" });
  });

  it("an Asian trade neither stopped nor at target by 04:00 УБ (20:00 UTC) closes on time at the last close", () => {
    const bars = [bar(1, { close: 3500 }), bar(32, { time: new Date("2026-11-25T19:45:00Z"), close: 3476.51 }), bar(33, { time: new Date("2026-11-25T20:00:00Z"), low: 3400 })];
    const o = signalOutcome(sell, bars, new Date("2026-11-25T21:00:00Z"));
    expect(o.kind).toBe("TIME");
    expect(o.r).toBeCloseTo(1, 2); // (3510.26 − 3476.51) / 33.75
  });

  it("is still open while nothing is hit and the day has not ended", () => {
    expect(signalOutcome(sell, [bar(1), bar(2)], new Date("2026-11-25T13:00:00Z"))).toEqual({ kind: "OPEN", r: null, at: null });
  });

  it("another rule has no time exit: it waits for the stop or the target however long it takes", () => {
    const dip: SignalLike = { ...buy, setupId: "trend-dip" };
    const late = { time: new Date("2026-11-27T05:00:00Z"), open: 100, high: 131, low: 99, close: 120 };
    const quiet = bar(1, { open: 100, high: 105, low: 95, close: 100 });
    expect(signalOutcome(dip, [quiet, late], new Date("2026-11-28T00:00:00Z"))).toMatchObject({ kind: "WIN", r: 3 });
    expect(signalOutcome(dip, [quiet], new Date("2026-11-28T00:00:00Z")).kind).toBe("OPEN");
  });
});

describe("outcomeTotals", () => {
  it("counts wins (including time exits in profit), losses, open trades and the total in R", () => {
    expect(outcomeTotals([
      { kind: "WIN", r: 3, at: null }, { kind: "LOSS", r: -1, at: null }, { kind: "TIME", r: 0.5, at: null },
      { kind: "TIME", r: -0.25, at: null }, { kind: "OPEN", r: null, at: null },
    ])).toEqual({ closed: 4, wins: 2, losses: 2, open: 1, totalR: 2.25, winPct: 50 });
  });
  it("has no win rate with nothing closed", () => {
    expect(outcomeTotals([{ kind: "OPEN", r: null, at: null }])).toEqual({ closed: 0, wins: 0, losses: 0, open: 1, totalR: 0, winPct: null });
  });
});
