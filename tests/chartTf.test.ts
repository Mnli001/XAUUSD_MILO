import { describe, it, expect } from "vitest";
import { CHART_TFS, CHART_TF_MS, aggregate, bucketStart, snapToBars } from "@/lib/chartTf";

const c = (iso: string, o: number, h: number, l: number, cl: number) => ({ time: new Date(iso), open: o, high: h, low: l, close: cl });

describe("chart timeframes", () => {
  it("are the eight MT5 ones, in order", () => {
    expect(CHART_TFS).toEqual(["1min", "5min", "15min", "30min", "1h", "4h", "1day", "1week"]);
    expect(CHART_TF_MS["30min"]).toBe(30 * 6e4);
    expect(CHART_TF_MS["1week"]).toBe(7 * 864e5);
  });
});

describe("bucketStart", () => {
  it("30 minutes start on :00 and :30; weeks start on Monday 00:00 UTC", () => {
    expect(bucketStart(Date.parse("2026-11-26T10:45:00Z"), "30min")).toBe(Date.parse("2026-11-26T10:30:00Z"));
    expect(bucketStart(Date.parse("2026-11-26T10:00:00Z"), "30min")).toBe(Date.parse("2026-11-26T10:00:00Z"));
    expect(bucketStart(Date.parse("2026-11-26T00:00:00Z"), "1week")).toBe(Date.parse("2026-11-23T00:00:00Z")); // Thursday -> Monday
    expect(bucketStart(Date.parse("2026-11-29T23:00:00Z"), "1week")).toBe(Date.parse("2026-11-23T00:00:00Z")); // Sunday -> the Monday before
    expect(bucketStart(Date.parse("2026-11-30T00:00:00Z"), "1week")).toBe(Date.parse("2026-11-30T00:00:00Z"));
  });
});

describe("aggregate", () => {
  it("merges bars into larger ones: first open, highest high, lowest low, last close", () => {
    const out = aggregate([
      c("2026-11-26T10:00:00Z", 10, 12, 9, 11), c("2026-11-26T10:15:00Z", 11, 15, 10, 14),
      c("2026-11-26T10:30:00Z", 14, 14, 8, 9),
    ], "30min");
    expect(out).toEqual([
      { time: new Date("2026-11-26T10:00:00Z"), open: 10, high: 15, low: 9, close: 14 },
      { time: new Date("2026-11-26T10:30:00Z"), open: 14, high: 14, low: 8, close: 9 },
    ]);
  });
  it("builds weeks from days", () => {
    const out = aggregate([c("2026-11-23T00:00:00Z", 1, 5, 1, 4), c("2026-11-27T00:00:00Z", 4, 9, 3, 8), c("2026-11-30T00:00:00Z", 8, 8, 6, 7)], "1week");
    expect(out.map((b) => [b.time.toISOString().slice(0, 10), b.open, b.high, b.low, b.close])).toEqual([["2026-11-23", 1, 9, 1, 8], ["2026-11-30", 8, 8, 6, 7]]);
  });
});

describe("snapToBars", () => {
  it("finds the bar a moment falls in, or null before the first bar or long after the last", () => {
    const bars = [Date.parse("2026-11-26T10:00:00Z"), Date.parse("2026-11-26T11:00:00Z")];
    expect(snapToBars(Date.parse("2026-11-26T10:59:00Z"), bars, 36e5)).toBe(bars[0]);
    expect(snapToBars(Date.parse("2026-11-26T11:30:00Z"), bars, 36e5)).toBe(bars[1]);
    expect(snapToBars(Date.parse("2026-11-26T09:59:00Z"), bars, 36e5)).toBeNull();
    expect(snapToBars(Date.parse("2026-11-26T13:00:00Z"), bars, 36e5)).toBeNull();
  });
});

import { withLive } from "@/lib/liveBar";
describe("withLive on the new timeframes", () => {
  it("opens the next M1 bar on the minute and the next W1 bar on Monday", () => {
    const m1 = [{ time: Date.parse("2026-11-26T10:00:00Z"), open: 1, high: 1, low: 1, close: 1 }];
    expect(withLive(m1, "1min", 2, Date.parse("2026-11-26T10:03:20Z")).at(-1)!.time).toBe(Date.parse("2026-11-26T10:03:00Z"));
    const w1 = [{ time: Date.parse("2026-11-23T00:00:00Z"), open: 1, high: 1, low: 1, close: 1 }];
    expect(withLive(w1, "1week", 2, Date.parse("2026-11-27T10:00:00Z"))).toHaveLength(1); // same week: stretched
    expect(withLive(w1, "1week", 2, Date.parse("2026-12-01T10:00:00Z")).at(-1)!.time).toBe(Date.parse("2026-11-30T00:00:00Z"));
  });
});
