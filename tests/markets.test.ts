import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { MARKETS, aggregate4h, marketView, ingestMarkets, dailyDue, checkMarketAlerts } from "@/lib/markets";
import { upsertCandles } from "@/lib/ingest/prices";
import { createPriceAlert, checkPriceAlerts, listPriceAlerts, alertText } from "@/lib/priceAlerts";
import { ProviderError, type PriceProvider } from "@/lib/data/priceProvider";
import type { Candle } from "@/lib/analysis/indicators";

const H = 36e5;
const t0 = Date.UTC(2026, 9, 1);
const hours = (n: number, start = t0, slope = 0.01): Candle[] => Array.from({ length: n }, (_, i) => {
  const c = 100 + i * slope; return { time: new Date(start + i * H), open: c - 0.005, high: c + 0.02, low: c - 0.02, close: c };
});
const days = (n: number, start: number, slope = 0.2): Candle[] => Array.from({ length: n }, (_, i) => {
  const c = 100 + i * slope; return { time: new Date(start + i * 864e5), open: c - 0.1, high: c + 0.5, low: c - 0.5, close: c };
});

describe("the reading", () => {
  it("builds 4-hour bars from hourly ones on the UTC clock", () => {
    const four = aggregate4h(hours(9, t0 + H)); // 01:00 … 09:00
    expect(four.map((c) => c.time.getUTCHours())).toEqual([0, 4, 8]);
    expect(four[0]).toMatchObject({ open: 100 - 0.005, close: 100.02 }); // 01–03
    expect(four[1].high).toBeCloseTo(100.06 + 0.02);
  });
  it("price, day change, direction per timeframe and yesterday's range", () => {
    const now = new Date(t0 + 900 * H + 30 * 6e4);
    const d = days(300, now.getTime() - 300 * 864e5 - (now.getTime() % 864e5)); // the last one is yesterday
    const v = marketView(hours(901), d, now)!;
    expect(v.price).toBeCloseTo(109);
    expect(v.prevHigh).toBeCloseTo(d.at(-1)!.high);
    expect(v.changePct).toBeCloseTo(((109 - d.at(-1)!.close) / d.at(-1)!.close) * 100);
    expect(v.scores["1h"]).toBeGreaterThan(0);
    expect(v.scores["1day"]).toBeGreaterThan(0);
    expect(v.bias?.label).toBe("ӨСӨХ хандлага"); // i18n-ok: the stored key
    expect(v.updatedAt.getTime()).toBe(t0 + 900 * H);
  });
  it("nothing stored: no reading", () => {
    expect(marketView([], [], new Date())).toBeNull();
  });
});

describe("loading", () => {
  beforeEach(resetDb);
  const now = new Date(t0 + 30 * 6e4);
  it("hourly bars for every market; one that fails is reported and the rest still load", async () => {
    const asked: string[] = [];
    const provider: PriceProvider = {
      async fetchCandles(symbol, tf, opts) {
        asked.push(`${symbol}:${tf}:${opts.outputsize}`);
        if (symbol === "BTCUSD") throw new ProviderError("limit", 429);
        return hours(3, t0 - 2 * H);
      },
    };
    const r = await ingestMarkets(provider, now);
    expect(r.failed).toEqual(["BTCUSD"]);
    expect(asked.filter((a) => a.endsWith(":1h:2000"))).toHaveLength(MARKETS.length); // empty: a long first load
    const n = await db.execute(sql`SELECT count(*)::int AS n FROM candles WHERE symbol = 'XAGUSD' AND timeframe = '1h'`);
    expect(n.rows[0]).toMatchObject({ n: 3 });
    expect(await db.select().from(schema.biasSnapshots)).toHaveLength(0); // gold's own reading is untouched
  });
  it("daily bars: one stale market per run, so the provider's per-minute limit is kept", async () => {
    expect(await dailyDue(now)).toBe(MARKETS[0].symbol);
    await upsertCandles(MARKETS[0].symbol, "1day", days(1, t0 - 864e5));
    expect(await dailyDue(now)).toBe(MARKETS[1].symbol);
  });
});

describe("price alerts on other instruments", () => {
  beforeEach(resetDb);
  const at = new Date(t0 + 2 * H);
  it("each alert waits for its own instrument", async () => {
    const u = await makeUser("m@x.mn");
    await db.execute(sql`UPDATE users SET access_until = '2027-06-01' WHERE id = ${u.id}`);
    await createPriceAlert(u.id, 32.5, 31.9, new Date(t0), "XAGUSD");
    await createPriceAlert(u.id, 4000, 3950, new Date(t0));
    const sent: string[] = [];
    const deps = { send: async (_c: string, h: string) => { sent.push(h); return true; }, push: async () => 0 };
    expect(await checkPriceAlerts({ high: 4001, low: 3990, price: 4001, at }, deps)).toBe(1); // gold: only the gold alert
    expect(await checkMarketAlerts("XAGUSD", [{ time: new Date(t0 + H), open: 32, high: 32.6, low: 31.8, close: 32.4 }], at, deps)).toBe(1);
    const rows = await listPriceAlerts(u.id, "XAGUSD");
    expect(rows.map((r) => r.symbol)).toEqual(["XAGUSD"]);
    expect(alertText({ ...rows[0], symbol: "XAGUSD" }, 32.6, at)).toContain("XAGUSD 32.5");
  });
});
