import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { parseCot, parseFred, ingestMacro, COT_GOLD_CODE } from "@/lib/ingest/macro";
import { driversView, correlation } from "@/lib/drivers";

describe("reading the sources", () => {
  it("FRED observations: numbers kept, '.' (no value that day) skipped", () => {
    expect(parseFred({ observations: [{ date: "2026-11-24", value: "120.5" }, { date: "2026-11-25", value: "." }, { date: "bad", value: "1" }] })).toEqual([{ date: "2026-11-24", value: 120.5 }]);
    expect(parseFred(null)).toEqual([]);
  });
  it("CFTC legacy report: speculators' net position and open interest per week", () => {
    const rows = parseCot([
      { report_date_as_yyyy_mm_dd: "2026-11-17T00:00:00.000", noncomm_positions_long_all: "300000", noncomm_positions_short_all: "80000", open_interest_all: "500000" },
      { report_date_as_yyyy_mm_dd: "2026-11-24T00:00:00.000", noncomm_positions_long_all: "310000", noncomm_positions_short_all: "70000", open_interest_all: "520000" },
      { report_date_as_yyyy_mm_dd: "2026-11-10", noncomm_positions_long_all: "x" },
    ]);
    expect(rows).toEqual([
      { date: "2026-11-17", net: 220000, oi: 500000 },
      { date: "2026-11-24", net: 240000, oi: 520000 },
    ]);
  });
});

describe("ingesting", () => {
  beforeEach(resetDb);
  afterEach(() => vi.unstubAllGlobals());

  it("stores each FRED series and the COT weeks, and a failing source does not stop the others", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      const u = String(url);
      urls.push(u);
      if (u.includes("DFII10")) return new Response("down", { status: 500 });
      if (u.includes("cftc")) return Response.json([{ report_date_as_yyyy_mm_dd: "2026-11-24T00:00:00.000", noncomm_positions_long_all: "310000", noncomm_positions_short_all: "70000", open_interest_all: "520000" }]);
      return Response.json({ observations: [{ date: "2026-11-24", value: "121.25" }] });
    });
    const r = await ingestMacro("key", new Date("2026-11-27T00:00:00Z"));
    expect(r.failed).toEqual(["DFII10"]);
    expect(urls.some((u) => u.includes(`cftc_contract_market_code=${COT_GOLD_CODE}`))).toBe(true);
    const rows = await db.select().from(schema.macroSeries);
    expect(rows.map((x) => `${x.series}:${x.date}:${x.value}`).sort()).toEqual(["COT_NC_NET:2026-11-24:240000", "COT_OI:2026-11-24:520000", "DGS10:2026-11-24:121.25", "DTWEXBGS:2026-11-24:121.25"]);
  });
});

describe("the view", () => {
  const days = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 5, 1) + i * 864e5).toISOString().slice(0, 10), value: f(i) }));

  it("correlation of daily changes: opposite moves give about −1", () => {
    expect(correlation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 5);
    expect(correlation([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it("latest values, 1-week and 1-month changes, the correlation with gold, and the COT reading", () => {
    const wiggle = (i: number) => Math.sin(i * 1.7) + (i % 3);
    const gold = days(120, (i) => 3000 + i * 2 - wiggle(i) * 10);
    const dollar = days(120, (i) => 120 - i * 0.05 + wiggle(i) * 0.4);
    const real = days(120, (i) => 2 - i * 0.002);
    const cot = Array.from({ length: 60 }, (_, i) => ({ date: new Date(Date.UTC(2025, 9, 7) + i * 7 * 864e5).toISOString().slice(0, 10), net: 100000 + i * 2000, oi: 500000 }));
    const v = driversView({ gold, dollar, real, nominal: days(120, () => 4), cot });
    expect(v.dollar!.last).toBeCloseTo(dollar.at(-1)!.value);
    expect(v.dollar!.week).toBeCloseTo(dollar.at(-1)!.value - dollar.at(-6)!.value);
    expect(v.dollar!.corr60).toBeLessThan(-0.5);
    expect(v.real!.month).toBeCloseTo(real.at(-1)!.value - real.at(-22)!.value);
    expect(v.cot).toMatchObject({ net: 218000, change: 2000, longPct: expect.any(Number), rank52: 100 });
    expect(v.tilt).toEqual({ dollar: "down", real: "down", cot: "crowded" });
  });

  it("copes with no data at all", () => {
    expect(driversView({ gold: [], dollar: [], real: [], nominal: [], cot: [] })).toMatchObject({ dollar: null, real: null, nominal: null, cot: null });
  });
});
