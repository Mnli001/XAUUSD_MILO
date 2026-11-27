import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ROBOT_FILE_VERSION } from "@/lib/bot/live";
import { capReport, forgetSyncCaches, getLiveView, handleSync, MAX_REPORT_DEALS, MAX_REPORT_POSITIONS, rotateToken, startBot, syncTiming } from "@/lib/bot/liveDb";
import { forgetRiskRules, riskTiming, saveRiskRule } from "@/lib/risk";
import { memoryLimiter } from "@/lib/rateLimit";
import { robotLimiter } from "@/lib/bot/syncLimit";
import { POST } from "@/app/api/bot/sync/route";
import type { User } from "@/lib/db/schema";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";

let u: User, token: string;
const t0 = new Date("2026-11-23T10:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);
const position = (ticket: string) => ({ ticket, side: "BUY", lots: 0.05, openPrice: 4099, sl: 4095, tp: 4107, profit: 12.5 });
const report = (o: Record<string, unknown> = {}) => ({
  account: { login: "51234567", mode: "DEMO", balance: 10000, equity: 10012.5, currency: "USD" },
  symbol: "XAUUSDm", bid: 4100.1, ask: 4100.4, signal: "BUY", reason: "EMA9>EMA21", runPnl: 12.5,
  positions: [position("11")], deals: [], finished: "", plannedSeconds: 360, elapsedSeconds: 42, version: ROBOT_FILE_VERSION, ...o,
});
const saved = { ...syncTiming }, savedRisk = { ...riskTiming };
const cachesOn = () => { Object.assign(syncTiming, { ownerTtlMs: 30_000, journalTtlMs: 30_000, newsTtlMs: 60_000, seenEveryMs: 10_000 }); riskTiming.ruleTtlMs = 30_000; };

/** Every SQL statement sent through the pool while `fn` runs. */
async function statements(fn: () => Promise<unknown>): Promise<string[]> {
  const pool = db.$client as unknown as { query: (...a: unknown[]) => unknown };
  const seen: string[] = [];
  const real = pool.query.bind(pool);
  const spy = vi.spyOn(pool, "query").mockImplementation((...a: unknown[]) => {
    const q = a[0] as string | { text?: string };
    seen.push(typeof q === "string" ? q : q?.text ?? "");
    return real(...a);
  });
  try { await fn(); } finally { spy.mockRestore(); }
  return seen;
}
const writes = (qs: string[]) => qs.filter((q) => /^\s*(insert|update|delete)\b/i.test(q));
const touching = (qs: string[], table: string) => qs.filter((q) => q.includes(`"${table}"`));

beforeEach(async () => {
  await resetDb();
  forgetSyncCaches();
  forgetRiskRules();
  robotLimiter.clear();
  u = await makeUser("robot@x.mn");
  await db.update(schema.users).set({ accessUntil: new Date("2027-06-01T00:00:00Z") }).where(eq(schema.users.id, u.id));
  token = await rotateToken(u.id);
});
afterEach(() => { Object.assign(syncTiming, saved); Object.assign(riskTiming, savedRisk); forgetSyncCaches(); forgetRiskRules(); vi.restoreAllMocks(); });

describe("a robot's steady reports", () => {
  test("cost no token, user, risk, journal or news reads and no writes once warm", async () => {
    cachesOn();
    await startBot(u.id, t0);
    await saveRiskRule(u.id, "51234567", { accountSize: 10_000, dailyLossPct: 5, maxLossPct: 10, profitTargetPct: null, closeOnBreach: true });
    await handleSync(token, report(), at(0)); // warms every cache, writes the bot row
    await handleSync(token, report(), at(1000));
    const qs = await statements(() => handleSync(token, report({ bid: 4101, ask: 4101.3, account: { login: "51234567", mode: "DEMO", balance: 10000, equity: 10020, currency: "USD" } }), at(2000)));
    expect(writes(qs)).toEqual([]);
    for (const table of ["bot_tokens", "users", "risk_rules", "journal_trades", "economic_events"]) expect(touching(qs, table)).toEqual([]);
    expect(touching(qs, "bot_live").length).toBe(1); // the bot row itself: Start/Stop must reach the robot at once
  });

  test("answer exactly as without the caches", async () => {
    await startBot(u.id, t0);
    await handleSync(token, report(), at(0));
    const plain = await handleSync(token, report(), at(2000));
    cachesOn();
    await handleSync(token, report(), at(2000)); // warms the caches
    expect(await handleSync(token, report(), at(2000))).toEqual(plain);
  });

  test("write at once when something a person sees changes, and refresh last-seen every 10 s otherwise", async () => {
    cachesOn();
    await handleSync(token, report(), at(0));
    const seen = async () => (await getLiveView(u.id, at(0))).lastSeenAt!.getTime();
    expect(await seen()).toBe(at(0).getTime());
    await handleSync(token, report({ bid: 4102 }), at(3000));
    expect(await seen()).toBe(at(0).getTime()); // only the price moved: nothing written
    await handleSync(token, report({ positions: [position("11"), position("12")] }), at(4000));
    expect(await seen()).toBe(at(4000).getTime()); // a new position is shown at once
    expect((await getLiveView(u.id, at(4000))).positions).toHaveLength(2);
    await handleSync(token, report({ positions: [position("11"), position("12")], signal: "SELL" }), at(5000));
    expect((await getLiveView(u.id, at(5000))).signal).toBe("SELL");
    await handleSync(token, report({ positions: [position("11"), position("12")], signal: "SELL", bid: 4110 }), at(16_000));
    const v = await getLiveView(u.id, at(16_000));
    expect(v.lastSeenAt!.getTime()).toBe(at(16_000).getTime());
    expect(v.bid).toBe(4110);
    expect(v.online).toBe(true);
  });

  test("a rotated token stops working at once, whatever is kept in memory", async () => {
    cachesOn();
    expect(await handleSync(token, report(), at(0))).not.toBeNull();
    const fresh = await rotateToken(u.id);
    expect(await handleSync(token, report(), at(1000))).toBeNull();
    expect(await handleSync(fresh, report(), at(2000))).not.toBeNull();
  });

  test("a deleted account's token is refused even while its owner is still in memory", async () => {
    cachesOn();
    await handleSync(token, report(), at(0));
    await db.execute(sql`DELETE FROM users WHERE id = ${u.id}`);
    await handleSync(token, report({ account: { login: "777", mode: "DEMO", balance: 1, equity: 1 } }), at(1000)).catch(() => null);
    expect(await handleSync(token, report(), at(2000))).toBeNull();
  });
});

describe("report size", () => {
  test("deals past 200 and positions past 100 are dropped, and that is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deals = Array.from({ length: 250 }, (_, i) => ({ ticket: String(i), side: "BUY", lots: 0.01, openPrice: 1, closePrice: 2, profit: 1, closeTime: "2026-11-20T09:00:00Z" }));
    const positions = Array.from({ length: 150 }, (_, i) => position(String(1000 + i)));
    const capped = capReport(report({ deals, positions })) as { deals: unknown[]; positions: unknown[] };
    expect(capped.deals).toHaveLength(MAX_REPORT_DEALS);
    expect(capped.positions).toHaveLength(MAX_REPORT_POSITIONS);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("deals 250→200"));
    expect(await handleSync(token, report({ deals, positions }), t0)).not.toBeNull(); // cut, not refused
    expect((await getLiveView(u.id, t0)).dealCount).toBe(200);
    expect((await getLiveView(u.id, t0)).positions).toHaveLength(100);
    expect(capReport(null)).toBeNull();
    expect(capReport({ nonsense: true })).toEqual({ nonsense: true });
  });
});

describe("rate limit", () => {
  test("about two reports a second per token; past that 429 with Retry-After", async () => {
    const l = memoryLimiter({ perSecond: 2, burst: 4 });
    for (let i = 0; i < 4; i++) expect(l.take("a", 0)).toBe(0);
    expect(l.take("a", 0)).toBe(1);
    expect(l.take("b", 0)).toBe(0); // another robot is not affected
    expect(l.take("a", 500)).toBe(0); // half a second gives one back
    expect(l.take("a", 500)).toBeGreaterThan(0);
    let ok = 0;
    for (let ms = 1000; ms < 11_000; ms += 100) if (l.take("a", ms) === 0) ok++;
    expect(ok).toBeGreaterThanOrEqual(19);
    expect(ok).toBeLessThanOrEqual(21);

    const call = () => POST(new Request("http://x/api/bot/sync", { method: "POST", headers: { "content-type": "application/json", "x-bot-token": token }, body: JSON.stringify(report()) }));
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await call()).status);
    expect(codes.slice(0, 4)).toEqual([200, 200, 200, 200]);
    const limited = await call();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });
});

describe("the status view", () => {
  test("is read-only and two queries", async () => {
    await handleSync(token, report({ deals: [{ ticket: "1", side: "BUY", lots: 0.05, openPrice: 1, closePrice: 2, profit: 7, closeTime: "2026-11-23T09:59:00Z" }, { ticket: "2", side: "BUY", lots: 0.05, openPrice: 1, closePrice: 2, profit: 5, closeTime: "2026-11-20T09:59:00Z" }] }), t0);
    let v: Awaited<ReturnType<typeof getLiveView>> | null = null;
    const qs = await statements(async () => { v = await getLiveView(u.id, t0); });
    expect(writes(qs)).toEqual([]);
    expect(qs).toHaveLength(2);
    expect(v!).toMatchObject({ account: "51234567", hasToken: true, dealCount: 2, pnl24h: 7, online: true, accounts: [{ login: "51234567" }] });
    expect(v!.deals.map((d) => d.ticket)).toEqual(["1", "2"]);
  });

  test("shows the robot's own loss guard as last reported, and null from robots that do not send it", async () => {
    await handleSync(token, report({ guard: "LOSS_DAY", guardDetail: "day −52.10 / limit 50.00", block: "LOSS_DAY" }), t0);
    expect(await getLiveView(u.id, t0)).toMatchObject({ guard: "LOSS_DAY", guardDetail: "day −52.10 / limit 50.00", block: "LOSS_DAY" });
    await handleSync(token, report({ guard: "", guardDetail: "" }), at(1000));
    expect(await getLiveView(u.id, at(1000))).toMatchObject({ guard: "", guardDetail: "" });
    cachesOn(); // a change of guard counts as visible: written at once, not held back for 10 s
    await handleSync(token, report({ guard: "", guardDetail: "" }), at(2000));
    await handleSync(token, report({ guard: "NETTING", guardDetail: "netting account" }), at(3000));
    expect(await getLiveView(u.id, at(3000))).toMatchObject({ guard: "NETTING", guardDetail: "netting account" });
    await handleSync(token, report({ version: 5 }), at(20_000)); // an older robot file reports none of it
    expect(await getLiveView(u.id, at(20_000))).toMatchObject({ guard: null, guardDetail: null });
  });

  test("shows a user who never connected the defaults without creating a bot", async () => {
    const fresh = await makeUser("new@x.mn");
    const qs = await statements(() => getLiveView(fresh.id, t0));
    expect(writes(qs)).toEqual([]);
    expect(await getLiveView(fresh.id, t0)).toMatchObject({ account: "", state: "STOPPED", hasToken: false, dealCount: 0, pnl24h: 0, deals: [], accounts: [] });
    expect(await db.select().from(schema.botLive).where(eq(schema.botLive.userId, fresh.id))).toHaveLength(0);
  });
});
