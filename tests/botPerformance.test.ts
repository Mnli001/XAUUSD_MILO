import { describe, it, expect, beforeEach } from "vitest";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { botTrades, pickAccount } from "@/lib/botPerformance";
import { performanceOf } from "@/lib/analysis/journal";

const deal = (userId: string, login: string, ticket: string, profit: number, closeTime: string, position: string | null = null) =>
  ({ userId, login, ticket, side: "BUY", lots: 0.01, openPrice: 1, closePrice: 1, profit, closeTime: new Date(closeTime), position });

beforeEach(async () => { await resetDb(); });

describe("botTrades", () => {
  it("one account's closed trades, oldest first, opened at the entry the robot recorded (else at the close)", async () => {
    const u = await makeUser("a@x.mn");
    await db.insert(schema.botEntries).values({ userId: u.id, login: "111", ticket: "p1", side: "BUY", openedAt: new Date("2026-11-20T01:00:00Z"), openPrice: 1, lots: 0.01, cBuy: 0, cSell: 0, cTotal: 0, session: "ASIA" });
    await db.insert(schema.botDeals).values([
      deal(u.id, "111", "d2", -4, "2026-11-21T09:00:00Z"),
      deal(u.id, "111", "d1", 10, "2026-11-20T03:00:00Z", "p1"),
      deal(u.id, "222", "d3", 99, "2026-11-21T09:00:00Z"),
    ]);
    const rows = await botTrades(u.id, "111");
    expect(rows.map((r) => [r.pnl, r.openedAt.toISOString(), r.closedAt.toISOString()])).toEqual([
      [10, "2026-11-20T01:00:00.000Z", "2026-11-20T03:00:00.000Z"],
      [-4, "2026-11-21T09:00:00.000Z", "2026-11-21T09:00:00.000Z"],
    ]);
  });
  it("is empty for someone else's account", async () => {
    const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn");
    await db.insert(schema.botDeals).values(deal(a.id, "111", "d1", 10, "2026-11-20T03:00:00Z"));
    expect(await botTrades(b.id, "111")).toEqual([]);
  });
});

describe("pickAccount", () => {
  const accounts = [{ login: "111" }, { login: "222" }];
  it("takes the asked account when it is one of yours, else the first (the one seen most recently)", () => {
    expect(pickAccount(accounts, "222")).toBe("222");
    expect(pickAccount(accounts, "999")).toBe("111");
    expect(pickAccount(accounts, undefined)).toBe("111");
    expect(pickAccount([], "111")).toBeNull();
  });
});

describe("performanceOf", () => {
  it("works from profit in dollars: total, win rate, profit factor, drawdown, curve", () => {
    const p = performanceOf([
      { pnl: 10, openedAt: new Date("2026-11-20T01:00:00Z"), closedAt: new Date("2026-11-20T03:00:00Z"), r: null },
      { pnl: -4, openedAt: new Date("2026-11-21T09:00:00Z"), closedAt: new Date("2026-11-21T09:00:00Z"), r: null },
      { pnl: 6, openedAt: new Date("2026-11-22T09:00:00Z"), closedAt: new Date("2026-11-22T10:00:00Z"), r: null },
    ]);
    expect(p).toMatchObject({ count: 3, totalPnl: 12, maxDrawdown: 4, avgR: null });
    expect(p.winRate).toBeCloseTo(66.67, 1);
    expect(p.profitFactor).toBe(4);
    expect(p.equity.map((e) => e.value)).toEqual([10, 6, 12]);
  });
});
