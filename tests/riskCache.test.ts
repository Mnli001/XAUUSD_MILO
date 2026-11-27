import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { applyRisk, deleteRiskRule, forgetRiskRules, getRiskRule, riskTiming, saveRiskRule } from "@/lib/risk";

const at = new Date("2026-11-27T05:00:00Z");
const LOGIN = "5001";
const limits = { accountSize: 10_000, dailyLossPct: 5, maxLossPct: 10, profitTargetPct: null, closeOnBreach: true };
const saved = { ...riskTiming };
let userId: string;
const sends = () => { const send = vi.fn(async () => true); const push = vi.fn(async () => 1); return { send, push }; };

beforeEach(async () => {
  await resetDb();
  forgetRiskRules();
  riskTiming.ruleTtlMs = 30_000;
  userId = (await makeUser("risk@x.mn")).id;
  await db.execute(sql`UPDATE users SET telegram_chat_id = '42' WHERE id = ${userId}`);
  await saveRiskRule(userId, LOGIN, limits);
});
afterEach(() => { Object.assign(riskTiming, saved); forgetRiskRules(); });

describe("the risk check on every report", () => {
  it("reads the rule once while it is fresh and writes nothing while nothing changes", async () => {
    const d = sends();
    await applyRisk(userId, LOGIN, { equity: 10_000 }, at, d); // the day's first report: day start written
    const before = (await getRiskRule(userId, LOGIN))!;
    expect(before.dayKey).toBe("2026-11-27");
    const pool = db.$client as unknown as { query: (...a: unknown[]) => unknown };
    const spy = vi.spyOn(pool, "query");
    for (let i = 0; i < 5; i++) expect(await applyRisk(userId, LOGIN, { equity: 9_900 + i }, at, d)).toEqual({ stop: false, closeAll: false });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("a breach is written, announced once and stops the bot; saving new rules is seen at once", async () => {
    const d = sends();
    await applyRisk(userId, LOGIN, { equity: 10_000 }, at, d);
    expect(await applyRisk(userId, LOGIN, { equity: 9_480 }, at, d)).toEqual({ stop: true, closeAll: true, reason: "RISK_DAILY" });
    expect(await applyRisk(userId, LOGIN, { equity: 9_470 }, at, d)).toEqual({ stop: true, closeAll: false, reason: "RISK_DAILY" });
    expect(d.send).toHaveBeenCalledTimes(1);
    expect((await getRiskRule(userId, LOGIN))!.breach).toBe("RISK_DAILY:2026-11-27");
    await saveRiskRule(userId, LOGIN, { ...limits, dailyLossPct: 8 }); // clears the breach
    expect((await applyRisk(userId, LOGIN, { equity: 9_470 }, at, d)).stop).toBe(false);
    await deleteRiskRule(userId, LOGIN);
    expect(await applyRisk(userId, LOGIN, { equity: 1 }, at, d)).toEqual({ stop: false, closeAll: false });
  });

  it("when another server already sent a notice, this one does not send it again", async () => {
    const d = sends();
    await applyRisk(userId, LOGIN, { equity: 10_000 }, at, d); // this instance now holds the rule in memory
    // another instance saw the same 80% warning first and recorded it
    await db.execute(sql`UPDATE risk_rules SET warned = 'daily:2026-11-27' WHERE user_id = ${userId} AND login = ${LOGIN}`);
    expect(await applyRisk(userId, LOGIN, { equity: 9_590 }, at, d)).toEqual({ stop: false, closeAll: false });
    expect(d.send).not.toHaveBeenCalled();
    expect(d.push).not.toHaveBeenCalled();
    expect((await getRiskRule(userId, LOGIN))!.warned).toBe("daily:2026-11-27");
  });
});
