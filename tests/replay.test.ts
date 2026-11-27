import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers/db";
import { upsertCandles, SYMBOL } from "@/lib/ingest/prices";
import { openTrade, stepTrades, summary, type PracticeTrade } from "@/lib/replay";
import { replayDays, loadReplay } from "@/lib/replay.server";

const bar = (t: number, o: number, h: number, l: number, c: number) => ({ time: t, open: o, high: h, low: l, close: c });

describe("practice trades", () => {
  it("open at the bar's close with the stop and target set in dollars", () => {
    const tr = openTrade("BUY", bar(0, 4000, 4002, 3998, 4001), 5, 10, 1);
    expect(tr).toMatchObject({ side: "BUY", entry: 4001, stop: 3996, target: 4011, openedAt: 0 });
    const s = openTrade("SELL", bar(0, 4000, 4002, 3998, 4001), 5, 10, 2);
    expect(s).toMatchObject({ stop: 4006, target: 3991 });
  });
  it("close at the target or the stop; when one bar touches both, the stop counts (the cautious reading)", () => {
    const t = openTrade("BUY", bar(0, 4000, 4002, 3998, 4000), 5, 10, 1);
    let open: PracticeTrade[] = [t];
    let r = stepTrades(open, bar(1, 4000, 4004, 3999, 4003));
    expect(r.closed).toEqual([]);
    open = r.open;
    r = stepTrades(open, bar(2, 4003, 4011, 4002, 4010));
    expect(r.closed[0]).toMatchObject({ exit: 4010, result: "WIN", r: 2 });
    r = stepTrades([t], bar(2, 4000, 4012, 3994, 4001));
    expect(r.closed[0]).toMatchObject({ exit: 3995, result: "LOSS", r: -1 });
  });
  it("sums the session in R and in dollars on 0.01 lot", () => {
    const s = summary([{ r: 2, pnl: 10, result: "WIN" }, { r: -1, pnl: -5, result: "LOSS" }, { r: 0.4, pnl: 2, result: "MANUAL" }] as never);
    expect(s).toEqual({ trades: 3, wins: 2, totalR: 1.4, pnl: 7, winPct: 67 });
  });
});

describe("picking a day", () => {
  beforeEach(resetDb);
  it("offers only past days with a full set of 15-minute bars, and hands out the day with the two before it", async () => {
    const day = (d: number, n: number) => Array.from({ length: n }, (_, i) => ({ time: new Date(Date.UTC(2026, 9, d) + i * 9e5), open: 4000, high: 4001, low: 3999, close: 4000 }));
    await upsertCandles(SYMBOL, "15min", [...day(5, 96), ...day(6, 96), ...day(7, 96), ...day(8, 40)]);
    const now = new Date(Date.UTC(2026, 10, 27));
    const days = await replayDays(now);
    expect(days).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    const r = await loadReplay("2026-10-07", now);
    expect(r!.context).toHaveLength(192);
    expect(r!.replay).toHaveLength(96);
    expect(r!.replay[0].time).toBe(Date.UTC(2026, 9, 7));
    expect(await loadReplay("2026-11-26", now)).toBeNull(); // not a past day with bars
  });
});
