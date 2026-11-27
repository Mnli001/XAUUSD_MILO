import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { upsertCandles, SYMBOL } from "@/lib/ingest/prices";
import { figuresFor, fillActuals, recordMoves, surprise, surpriseStats } from "@/lib/ingest/actuals";

const obs = (pairs: [string, number][]) => pairs.map(([date, value]) => ({ date, value }));

describe("figures from FRED", () => {
  it("NFP is the monthly change in payrolls, in thousands", () => {
    expect(figuresFor("change_k", obs([["2026-08-01", 159000], ["2026-09-01", 159150], ["2026-10-01", 159377]]))).toEqual({ actual: "+227K", previous: "+150K", period: "2026-10-01" });
  });
  it("CPI, PPI, retail sales and PCE are month-on-month % changes", () => {
    expect(figuresFor("pct_mom", obs([["2026-08-01", 320], ["2026-09-01", 321.28], ["2026-10-01", 321.6]]))).toEqual({ actual: "+0.1%", previous: "+0.4%", period: "2026-10-01" });
  });
  it("GDP is the published growth rate as it is", () => {
    expect(figuresFor("level_pct", obs([["2026-04-01", 3.1], ["2026-07-01", 2.8]]))).toEqual({ actual: "2.8%", previous: "3.1%", period: "2026-07-01" });
  });
  it("too few observations give nothing", () => {
    expect(figuresFor("pct_mom", obs([["2026-10-01", 1]]))).toBeNull();
  });
});

describe("surprise", () => {
  it("compares the leading numbers, whatever the units", () => {
    expect(surprise("+227K", "180K")).toBe("above");
    expect(surprise("0.1%", "+0.3%")).toBe("below");
    expect(surprise("4.25%", "4.25%")).toBe("inline");
    expect(surprise("2.8%", null)).toBeNull();
    expect(surprise("n/a", "1")).toBeNull();
  });
});

describe("filling and measuring", () => {
  beforeEach(resetDb);
  afterEach(() => vi.unstubAllGlobals());
  const nfp = (iso: string, o: Partial<typeof schema.economicEvents.$inferInsert> = {}) =>
    db.insert(schema.economicEvents).values({ type: "NFP", title: "Ажил эрхлэлтийн тайлан (NFP)", country: "АНУ", impact: "HIGH", time: new Date(iso), source: "fred", ...o }).returning();

  it("fills a released event's actual and previous once FRED has the new month, and not before", async () => {
    const [e] = await nfp("2026-11-06T13:30:00Z", { forecast: "180K" });
    let latest = "2026-09-01";
    vi.stubGlobal("fetch", async () => Response.json({ observations: latest === "2026-09-01"
      ? [{ date: "2026-07-01", value: "158900" }, { date: "2026-08-01", value: "159000" }, { date: "2026-09-01", value: "159150" }]
      : [{ date: "2026-08-01", value: "159000" }, { date: "2026-09-01", value: "159150" }, { date: "2026-10-01", value: "159377" }] }));
    // a September figure already belongs to the October release (filled earlier)
    await nfp("2026-10-02T12:30:00Z", { actual: "+150K", actualPeriod: "2026-09-01" });
    expect(await fillActuals("key", new Date("2026-11-06T14:00:00Z"))).toBe(0);
    latest = "2026-10-01";
    expect(await fillActuals("key", new Date("2026-11-06T15:00:00Z"))).toBe(1);
    const [row] = await db.select().from(schema.economicEvents).where(eq(schema.economicEvents.id, e.id));
    expect(row).toMatchObject({ actual: "+227K", previous: "+150K", actualPeriod: "2026-10-01", forecast: "180K" });
  });

  it("records gold's move 15 and 60 minutes after a release and splits the history by surprise", async () => {
    const t0 = Date.UTC(2026, 10, 6, 13, 30);
    await upsertCandles(SYMBOL, "15min", Array.from({ length: 6 }, (_, i) => ({ time: new Date(t0 + i * 9e5), open: 4000 + i * 2, high: 4010, low: 3990, close: 4002 + i * 2 })));
    await nfp("2026-11-06T13:30:00Z", { forecast: "180K", actual: "+227K" });
    expect(await recordMoves(new Date(t0 + 2 * 36e5))).toBe(1);
    const [row] = await db.select().from(schema.economicEvents);
    expect(row.move15).toBeCloseTo(2);
    expect(row.move60).toBeCloseTo(8);
    const stats = surpriseStats([
      { forecast: "180K", actual: "+227K", move60: 8 }, { forecast: "180K", actual: "+250K", move60: -4 }, { forecast: "180K", actual: "+200K", move60: 6 },
      { forecast: "180K", actual: "+90K", move60: 12 },
    ]);
    expect(stats.above).toEqual({ n: 3, avg: 3.33, upPct: 67 });
    expect(stats.below).toEqual({ n: 1, avg: 12, upPct: 100 });
  });
});
