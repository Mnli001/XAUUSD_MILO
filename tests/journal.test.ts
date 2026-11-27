import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { journalFrom, storeJournal, listJournal, JOURNAL_BACKFILL_DAYS } from "@/lib/journal";
import { journalStats, type JRow } from "@/lib/journalStats";
import { viewer } from "@/lib/viewer";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { handleSync, rotateToken } from "@/lib/bot/liveDb";

const row = (o: Partial<JRow>): JRow => ({ symbol: "XAUUSD", side: "BUY", lots: 0.1, openPrice: 4000, closePrice: 4001, openTime: new Date("2026-11-02T08:00:00Z"), closeTime: new Date("2026-11-02T09:00:00Z"), profit: 10, magic: "0", ...o });

describe("storing", () => {
  beforeEach(resetDb);
  it("keeps each closing deal once and tells the robot where to continue", async () => {
    const u = await makeUser("a@x.mn");
    const now = new Date("2026-11-27T00:00:00Z");
    expect((await journalFrom(u.id, "5001", now)).getTime()).toBe(now.getTime() - JOURNAL_BACKFILL_DAYS * 864e5);
    const deal = { ticket: "1", position: "11", symbol: "XAUUSD", side: "BUY" as const, lots: 0.1, openPrice: 4000, closePrice: 4010, openTime: new Date("2026-11-20T01:00:00Z"), closeTime: new Date("2026-11-20T02:00:00Z"), profit: 100, magic: "0" };
    expect(await storeJournal(u.id, "5001", [deal, { ...deal, ticket: "2", closeTime: new Date("2026-11-21T02:00:00Z") }])).toBe(2);
    expect(await storeJournal(u.id, "5001", [deal])).toBe(0);
    expect((await journalFrom(u.id, "5001", now)).toISOString()).toBe("2026-11-21T02:00:00.000Z");
    expect(await listJournal(u.id, { source: "all" })).toHaveLength(2);
    expect(await listJournal(u.id, { source: "robot" })).toHaveLength(0);
  });
});

describe("the analysis", () => {
  const v = viewer({ locale: "en", timeZone: "Asia/Ulaanbaatar" });
  it("totals: win rate, net, profit factor, expectancy, worst streak", () => {
    const s = journalStats([row({ profit: 30 }), row({ profit: -10 }), row({ profit: -10 }), row({ profit: 20 })], v);
    expect(s.totals).toMatchObject({ trades: 4, wins: 2, winPct: 50, net: 30, avgWin: 25, avgLoss: -10, profitFactor: 2.5, expectancy: 7.5, maxLossStreak: 2 });
  });
  it("splits by session, weekday and hour on the reader's clock", () => {
    const rows = [
      row({ openTime: new Date("2026-11-02T01:00:00Z"), profit: 10 }), // 09:00 UB: Asia
      row({ openTime: new Date("2026-11-02T13:30:00Z"), profit: -20 }), // 21:30 UB: New York
      row({ openTime: new Date("2026-11-03T13:45:00Z"), profit: -5 }),
    ];
    const s = journalStats(rows, v);
    expect(s.bySession.find((x) => x.key === "ASIA")).toMatchObject({ trades: 1, net: 10 });
    expect(s.bySession.find((x) => x.key === "NY")).toMatchObject({ trades: 2, net: -25, winPct: 0 });
    expect(s.byHour.find((x) => x.key === "21")).toMatchObject({ trades: 2 });
    expect(s.byWeekday.find((x) => x.key === "1")).toMatchObject({ trades: 2 }); // Monday
  });
  it("finds trades taken right after a loss, oversized lots, and losers held longer than winners", () => {
    const t = (min: number) => new Date(Date.UTC(2026, 10, 2, 8, 0) + min * 6e4);
    const rows = [
      row({ openTime: t(0), closeTime: t(30), profit: -10 }),
      row({ openTime: t(35), closeTime: t(200), profit: -15 }), // 5 min after a loss, held long
      row({ openTime: t(300), closeTime: t(310), profit: 8 }),
      row({ openTime: t(400), closeTime: t(410), profit: 6, lots: 0.5 }), // oversized
      row({ openTime: t(500), closeTime: t(505), profit: 5 }),
    ];
    const s = journalStats(rows, v);
    expect(s.behaviour.afterLoss).toMatchObject({ trades: 1, winPct: 0, net: -15 });
    expect(s.behaviour.bigLots).toMatchObject({ trades: 1, net: 6 });
    expect(s.behaviour.holdLoss).toBeGreaterThan(s.behaviour.holdWin!);
    expect(s.insights.map((i) => i.kind)).toContain("revenge");
    expect(s.insights.map((i) => i.kind)).toContain("hold");
  });
  it("copes with nothing", () => {
    expect(journalStats([], v).totals.trades).toBe(0);
  });
});

describe("the robot's report", () => {
  beforeEach(resetDb);
  const now = new Date("2026-11-27T10:00:00Z");
  const report = (o: Record<string, unknown> = {}) => ({
    account: { login: "7001", mode: "DEMO", balance: 1000, equity: 1000 }, symbol: "XAUUSD", bid: 4100, ask: 4100.3, signal: "NONE", reason: "", runPnl: 0,
    positions: [], deals: [], finished: "", version: 15, ...o,
  });
  it("keeps the account's closed trades, by hand or any robot, and tells the robot where to continue", async () => {
    const u = await makeUser("j@x.mn");
    await db.execute(sql`UPDATE users SET access_until = '2027-06-01' WHERE id = ${u.id}`);
    const token = await rotateToken(u.id);
    const first = await handleSync(token, report(), now);
    expect(first!.jFrom).toBe(Math.floor((now.getTime() - JOURNAL_BACKFILL_DAYS * 864e5) / 1000));
    const journal = [
      { ticket: "9", position: "90", symbol: "EURUSD", side: "SELL", lots: 1, openPrice: 1.1, closePrice: 1.09, openTime: "2026-11-26T01:00:00Z", closeTime: "2026-11-26T02:00:00Z", profit: 95.5, magic: "0" },
      { ticket: "10", symbol: "XAUUSD", side: "BUY", lots: 0.1, openPrice: 4000, closePrice: 3990, openTime: "2026-11-26T03:00:00Z", closeTime: "2026-11-26T04:00:00Z", profit: -100, magic: "770011" },
    ];
    const cmd = await handleSync(token, report({ journal }), now);
    expect(cmd!.jFrom).toBe(Date.parse("2026-11-26T04:00:00Z") / 1000);
    expect((await listJournal(u.id, { source: "manual" })).map((r) => r.symbol)).toEqual(["EURUSD"]);
    expect(await listJournal(u.id, { source: "robot" })).toHaveLength(1);
  });
  it("an older robot without the journal still syncs", async () => {
    const u = await makeUser("old@x.mn");
    await db.execute(sql`UPDATE users SET access_until = '2027-06-01' WHERE id = ${u.id}`);
    expect(await handleSync(await rotateToken(u.id), report({ version: 14 }), now)).not.toBeNull();
  });
});
