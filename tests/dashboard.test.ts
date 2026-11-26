import { describe, it, expect, beforeEach } from "vitest";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { planSummary, tradeSummary, botSummary, latestPaidPlan } from "@/lib/dashboard";

const DAY = 864e5;
const now = new Date("2026-11-26T10:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);

describe("planSummary", () => {
  it("an admin has everything, without an end date", () => {
    expect(planSummary({ role: "ADMIN", accessUntil: null }, null, now)).toEqual({ kind: "admin" });
  });
  it("an active plan shows its name, end and whole days left (a part day counts as a day)", () => {
    const until = new Date(now.getTime() + 141.2 * DAY);
    expect(planSummary({ role: "USER", accessUntil: until }, "PRO", now)).toEqual({ kind: "active", plan: "PRO", until, daysLeft: 142 });
  });
  it("an active plan with no payment on record (granted by the admin) has no plan name", () => {
    const until = new Date(now.getTime() + 2 * DAY);
    expect(planSummary({ role: "USER", accessUntil: until }, null, now)).toMatchObject({ kind: "active", plan: null, daysLeft: 2 });
  });
  it("a plan that ran out says when", () => {
    const until = ago(3);
    expect(planSummary({ role: "USER", accessUntil: until }, "PLUS", now)).toEqual({ kind: "expired", until });
  });
  it("someone who never had a plan has none", () => {
    expect(planSummary({ role: "USER", accessUntil: null }, null, now)).toEqual({ kind: "none" });
  });
});

describe("tradeSummary", () => {
  const tr = (pnl: number, closedDaysAgo: number) => ({ pnl, openedAt: ago(closedDaysAgo + 0.1), closedAt: ago(closedDaysAgo), r: null });

  it("sums the robot's last 30 days of closed trades: profit, wins, losses, win rate", () => {
    const s = tradeSummary([tr(100, 1), tr(-50, 2), tr(100, 3)], 0, now);
    expect(s.month).toEqual({ closed: 3, wins: 2, losses: 1, pnl: 150, winRate: 67 });
  });
  it("leaves older trades out of the month but in the all-time total, and takes open positions from the robot", () => {
    const s = tradeSummary([tr(100, 59), tr(100, 1)], 2, now);
    expect(s.month).toMatchObject({ closed: 1, pnl: 100 });
    expect(s.allTime).toEqual({ closed: 2, pnl: 200 });
    expect(s.open).toBe(2);
  });
  it("has no win rate with nothing closed", () => {
    expect(tradeSummary([], 0, now)).toEqual({ month: { closed: 0, wins: 0, losses: 0, pnl: 0, winRate: null }, allTime: { closed: 0, pnl: 0 }, open: 0 });
  });
});

describe("botSummary", () => {
  beforeEach(async () => { await resetDb(); });

  it("someone who never set the bot up reads as not connected, and nothing is written for them", async () => {
    const u = await makeUser("a@x.mn");
    expect(await botSummary(u.id, now)).toEqual({ connected: false, running: false, online: false, positions: 0, pnl24h: 0, account: null });
    expect(await db.select().from(schema.botLive)).toHaveLength(0);
  });

  it("reads the account seen most recently: running, online, open positions, and the last day's closed profit", async () => {
    const u = await makeUser("a@x.mn");
    await db.insert(schema.botTokens).values({ userId: u.id, tokenHash: "h" });
    const pos = { ticket: "1", side: "BUY", lots: 0.1, openPrice: 1, sl: 0, tp: 0, profit: 5 };
    await db.insert(schema.botLive).values([
      { userId: u.id, login: "111", state: "STOPPED", config: {}, lastSeenAt: ago(5), status: { positions: [] } },
      { userId: u.id, login: "222", state: "RUNNING", config: {}, lastSeenAt: new Date(now.getTime() - 5000), status: { positions: [pos, { ...pos, ticket: "2" }] } },
    ]);
    const deal = { userId: u.id, side: "BUY", lots: 0.1, openPrice: 1, closePrice: 1 };
    await db.insert(schema.botDeals).values([
      { ...deal, login: "222", ticket: "a", profit: 12.5, closeTime: new Date(now.getTime() - 3600e3) },
      { ...deal, login: "222", ticket: "b", profit: -2.5, closeTime: new Date(now.getTime() - 7200e3) },
      { ...deal, login: "222", ticket: "c", profit: 99, closeTime: ago(2) }, // older than a day
      { ...deal, login: "111", ticket: "d", profit: 50, closeTime: new Date(now.getTime() - 3600e3) }, // the other account
    ]);
    expect(await botSummary(u.id, now)).toEqual({ connected: true, running: true, online: true, positions: 2, pnl24h: 10, account: "222" });
  });

  it("a robot not heard from for a while is offline", async () => {
    const u = await makeUser("a@x.mn");
    await db.insert(schema.botTokens).values({ userId: u.id, tokenHash: "h" });
    await db.insert(schema.botLive).values({ userId: u.id, login: "111", state: "RUNNING", config: {}, lastSeenAt: new Date(now.getTime() - 60e3), status: null });
    expect(await botSummary(u.id, now)).toMatchObject({ connected: true, running: true, online: false, positions: 0 });
  });
});

describe("latestPaidPlan", () => {
  beforeEach(async () => { await resetDb(); });
  it("is the plan of the newest paid payment, ignoring pending and expired ones", async () => {
    const u = await makeUser("a@x.mn");
    const base = { userId: u.id, amount: 1, days: 1, expiresAt: now };
    await db.insert(schema.payments).values([
      { ...base, plan: "PLUS", status: "PAID", senderInvoiceNo: "1", createdAt: ago(40), paidAt: ago(40) },
      { ...base, plan: "PRO", status: "PAID", senderInvoiceNo: "2", createdAt: ago(5), paidAt: ago(5) },
      { ...base, plan: "MAX", status: "PENDING", senderInvoiceNo: "3", createdAt: ago(1) },
    ]);
    expect(await latestPaidPlan(u.id)).toBe("PRO");
    expect(await latestPaidPlan((await makeUser("b@x.mn")).id)).toBeNull();
  });
});
