import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DEFAULT_LIVE_CONFIG } from "@/lib/bot/live";
import { PUBLIC_RECORD_KEY, clearPublicRecord, computeRecordStats, forgetPublicRecord, getPublicRecord, readPublicRecordSetting, setPublicRecord, type RecordDeal } from "@/lib/publicRecord";
import type { User } from "@/lib/db/schema";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

const since = new Date("2026-11-19T16:00:00Z"); // 2026-11-20 00:00 UB
const now = new Date("2026-11-23T10:00:00Z"); // 2026-11-23 18:00 UB
const deal = (closeTime: string, profit: number, side = "BUY"): RecordDeal => ({ closeTime: new Date(closeTime), side, lots: 0.02, openPrice: 4000, closePrice: 4000 + profit / 2, profit });
const deals: RecordDeal[] = [
  deal("2026-11-22T03:00:00Z", 200), // given out of order on purpose
  deal("2026-11-20T02:00:00Z", 100),
  deal("2026-11-20T05:00:00Z", -50, "SELL"),
  deal("2026-11-21T03:00:00Z", -60),
  deal("2026-11-19T10:00:00Z", 999), // before the start: not counted
];

describe("computeRecordStats", () => {
  const s = computeRecordStats(deals, 1000, since, now);
  it("counts trades and wins from the start date only", () => {
    expect(s.trades).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.winRate).toBe(50);
  });
  it("works out profit and return on the starting balance", () => {
    expect(s.profit).toBe(190);
    expect(s.returnPct).toBe(19);
  });
  it("measures the deepest fall of the closed balance from its high", () => {
    // 1000 → 1100 (high) → 1050 → 990: (1100 − 990) / 1100 = 10%
    expect(s.maxDrawdownPct).toBe(10);
    expect(computeRecordStats([deal("2026-11-20T02:00:00Z", 50), deal("2026-11-20T03:00:00Z", 50)], 1000, since, now).maxDrawdownPct).toBe(0);
  });
  it("gives the closed balance at the end of every UB day, carrying quiet days", () => {
    expect(s.series).toEqual([
      { day: "2026-11-20", balance: 1050 },
      { day: "2026-11-21", balance: 990 },
      { day: "2026-11-22", balance: 1190 },
      { day: "2026-11-23", balance: 1190 },
    ]);
  });
  it("lists the last trades newest first, at most ten, with no ticket", () => {
    expect(s.lastTrades.map((d) => d.profit)).toEqual([200, -60, -50, 100]);
    expect(s.lastTrades[2]).toEqual({ time: "2026-11-20T05:00:00.000Z", side: "SELL", lots: 0.02, entry: 4000, exit: 3975, profit: -50 });
    const many = Array.from({ length: 15 }, (_, i) => deal(new Date(since.getTime() + (i + 1) * 36e5).toISOString(), i));
    expect(computeRecordStats(many, 1000, since, now).lastTrades).toHaveLength(10);
  });
  it("is all zeros with no trades", () => {
    const empty = computeRecordStats([], 1000, since, now);
    expect(empty).toMatchObject({ trades: 0, wins: 0, winRate: 0, profit: 0, returnPct: 0, maxDrawdownPct: 0 });
    expect(empty.series.every((p) => p.balance === 1000)).toBe(true);
  });
});

describe("the public record setting", () => {
  let admin: User, other: User, member: User;
  const LOGIN = "51234567";
  const addBot = (userId: string, login: string, mode = "DEMO", balance = 1190) =>
    db.insert(schema.botLive).values({ userId, login, server: "JustMarkets-Demo", config: DEFAULT_LIVE_CONFIG, status: { account: { login: `••••${login.slice(-4)}`, mode, balance, equity: balance, currency: "USD" } } });
  const addDeals = (userId: string, login: string) =>
    db.insert(schema.botDeals).values(deals.map((d, i) => ({ ...d, userId, login, ticket: `TKT-${i}` })));

  beforeEach(async () => {
    await resetDb();
    await db.delete(schema.appState).where(eq(schema.appState.key, PUBLIC_RECORD_KEY));
    forgetPublicRecord();
    admin = await makeUser("owner@x.mn", "ADMIN");
    other = await makeUser("admin2@x.mn", "ADMIN");
    member = await makeUser("member@x.mn");
    await addBot(admin.id, LOGIN);
    await addDeals(admin.id, LOGIN);
  });

  it("is empty until an account is chosen", async () => {
    expect(await getPublicRecord(now)).toBeNull();
  });

  it("only an admin may choose, and only one of their own accounts", async () => {
    await expect(setPublicRecord(member.id, LOGIN, "2026-11-20", now)).rejects.toThrow();
    await addBot(member.id, "999111");
    expect((await setPublicRecord(admin.id, "999111", "2026-11-20", now)).error).toBeTruthy(); // the member's account
    expect((await setPublicRecord(other.id, LOGIN, "2026-11-20", now)).error).toBeTruthy(); // another admin's account
    expect((await setPublicRecord(admin.id, LOGIN, "2026-12-01", now)).error).toBeTruthy(); // in the future
    expect((await setPublicRecord(admin.id, LOGIN, "not-a-date", now)).error).toBeTruthy();
    expect(await readPublicRecordSetting()).toBeNull();
  });

  it("stores {userId, login, since, startBalance}, the start balance being today's less what closed since", async () => {
    expect(await setPublicRecord(admin.id, LOGIN, "2026-11-20", now)).toEqual({});
    expect(await readPublicRecordSetting()).toEqual({ userId: admin.id, login: LOGIN, since: since.toISOString(), startBalance: 1000 });
  });

  it("defaults the start to today", async () => {
    expect(await setPublicRecord(admin.id, LOGIN, "", now)).toEqual({});
    expect((await readPublicRecordSetting())!.since).toBe("2026-11-22T16:00:00.000Z"); // 2026-11-23 00:00 UB
    const r = await getPublicRecord(now);
    expect(r).toMatchObject({ trades: 0, sinceDay: "2026-11-23", daysRunning: 1, mode: "DEMO" });
  });

  it("returns the figures from that account only, with nothing that identifies it", async () => {
    await addBot(admin.id, "77770000");
    await db.insert(schema.botDeals).values({ userId: admin.id, login: "77770000", ticket: "X1", side: "BUY", lots: 1, openPrice: 1, closePrice: 2, profit: 5000, closeTime: new Date("2026-11-21T00:00:00Z") });
    await setPublicRecord(admin.id, LOGIN, "2026-11-20", now);
    const r = (await getPublicRecord(now))!;
    expect(r).toMatchObject({ mode: "DEMO", trades: 4, wins: 2, winRate: 50, profit: 190, returnPct: 19, maxDrawdownPct: 10, startBalance: 1000, daysRunning: 4, sinceDay: "2026-11-20", currency: "USD" });
    expect(r.lastTrades).toHaveLength(4);
    const json = JSON.stringify(r);
    for (const secret of [LOGIN, LOGIN.slice(-4), admin.id, admin.email, "TKT-", "JustMarkets"]) expect(json).not.toContain(secret);
    expect(Object.keys(r).sort()).toEqual(["currency", "daysRunning", "lastTrades", "maxDrawdownPct", "mode", "profit", "returnPct", "series", "since", "sinceDay", "startBalance", "trades", "updatedAt", "winRate", "wins"]);
    expect(Object.keys(r.lastTrades[0]).sort()).toEqual(["entry", "exit", "lots", "profit", "side", "time"]);
  });

  it("labels a real account Real", async () => {
    await db.update(schema.botLive).set({ status: { account: { mode: "REAL", balance: 1190, equity: 1190 } } }).where(eq(schema.botLive.login, LOGIN));
    await setPublicRecord(admin.id, LOGIN, "2026-11-20", now);
    expect((await getPublicRecord(now))!.mode).toBe("REAL");
  });

  it("can be cleared, by an admin only", async () => {
    await setPublicRecord(admin.id, LOGIN, "2026-11-20", now);
    await expect(clearPublicRecord(member.id)).rejects.toThrow();
    expect(await getPublicRecord(now)).not.toBeNull();
    await clearPublicRecord(admin.id);
    expect(await getPublicRecord(now)).toBeNull();
  });

  it("shows nothing if the owner is no longer an admin", async () => {
    await setPublicRecord(admin.id, LOGIN, "2026-11-20", now);
    await db.update(schema.users).set({ role: "USER" }).where(eq(schema.users.id, admin.id));
    expect(await getPublicRecord(now)).toBeNull();
  });
});
