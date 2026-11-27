import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { PRESETS, applyRisk, getRiskRule, riskReading, saveRiskRule, type RiskRule } from "@/lib/risk";
import type { PushMessage } from "@/lib/push";

const rule = (o: Partial<RiskRule> = {}): RiskRule => ({ accountSize: 10_000, dailyLossPct: 5, maxLossPct: 10, profitTargetPct: 10, closeOnBreach: true, dayKey: "2026-11-27", dayStartEquity: 10_000, warned: "", breach: null, ...o });
const at = new Date("2026-11-27T05:00:00Z");

describe("reading the limits", () => {
  it("measures today's loss from the day's start and the total loss from the account size", () => {
    const r = riskReading(rule({ dayStartEquity: 10_200 }), 9_900, at);
    expect(r.daily).toEqual({ used: 300, limit: 500, pct: 60 });
    expect(r.max).toEqual({ used: 100, limit: 1000, pct: 10 });
    expect(r.target).toEqual({ made: -100, goal: 1000, pct: 0 });
    expect(r.events).toEqual([]);
  });
  it("warns at 80% of a limit and breaches at 100%", () => {
    expect(riskReading(rule(), 9_590, at).events).toEqual(["daily_warn"]);
    expect(riskReading(rule(), 9_500, at).events).toEqual(["daily_breach"]);
    expect(riskReading(rule({ dayStartEquity: 9_200 }), 9_000, at).events).toEqual(["max_breach"]);
    expect(riskReading(rule(), 11_000, at).events).toEqual(["target"]);
  });
  it("a new day starts from the equity at its first report", () => {
    const r = riskReading(rule({ dayKey: "2026-11-26", dayStartEquity: 12_000 }), 9_700, at);
    expect(r.dayKey).toBe("2026-11-27");
    expect(r.dayStartEquity).toBe(9_700);
    expect(r.daily.used).toBe(0);
  });
  it("ships the usual prop-firm presets", () => {
    expect(PRESETS.find((p) => p.id === "ftmo")).toMatchObject({ dailyLossPct: 5, maxLossPct: 10, profitTargetPct: 10 });
  });
});

describe("on each robot report", () => {
  let sent: string[];
  let pushed: PushMessage[];
  const deps = { send: async (_c: string, html: string) => { sent.push(html); return true; }, push: async (_u: string, m: PushMessage) => { pushed.push(m); return 1; } };
  beforeEach(async () => { await resetDb(); sent = []; pushed = []; });

  it("tells the member once per day near the limit, then stops the bot and closes its trades at the limit", async () => {
    const u = await makeUser("a@x.mn");
    await db.execute(sql`UPDATE users SET telegram_chat_id = '111' WHERE id = ${u.id}`);
    expect(await saveRiskRule(u.id, "5001", { accountSize: 10_000, dailyLossPct: 5, maxLossPct: 10, profitTargetPct: null, closeOnBreach: true })).toEqual({});
    expect(await applyRisk(u.id, "5001", { equity: 10_000 }, at, deps)).toEqual({ stop: false, closeAll: false });
    expect(await applyRisk(u.id, "5001", { equity: 9_580 }, new Date(at.getTime() + 6e4), deps)).toEqual({ stop: false, closeAll: false });
    expect(await applyRisk(u.id, "5001", { equity: 9_570 }, new Date(at.getTime() + 12e4), deps)).toEqual({ stop: false, closeAll: false });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("80%");
    expect(await applyRisk(u.id, "5001", { equity: 9_480 }, new Date(at.getTime() + 18e4), deps)).toEqual({ stop: true, closeAll: true, reason: "RISK_DAILY" });
    expect(sent).toHaveLength(2);
    expect(pushed.at(-1)!.title).toMatch(/хязгаар/);
    // after the breach the bot stays stopped for the rest of the day, without more messages
    expect(await applyRisk(u.id, "5001", { equity: 9_600 }, new Date(at.getTime() + 24e4), deps)).toEqual({ stop: true, closeAll: false, reason: "RISK_DAILY" });
    expect(sent).toHaveLength(2);
    // the next day it is free again
    expect(await applyRisk(u.id, "5001", { equity: 9_600 }, new Date(at.getTime() + 864e5), deps)).toEqual({ stop: false, closeAll: false });
  });

  it("the overall limit holds until the member changes the rules", async () => {
    const u = await makeUser("a@x.mn");
    await saveRiskRule(u.id, "5001", { accountSize: 10_000, dailyLossPct: 5, maxLossPct: 10, profitTargetPct: null, closeOnBreach: false });
    await applyRisk(u.id, "5001", { equity: 9_200 }, at, deps);
    expect(await applyRisk(u.id, "5001", { equity: 8_990 }, new Date(at.getTime() + 864e5), deps)).toEqual({ stop: true, closeAll: false, reason: "RISK_MAX" });
    expect(await applyRisk(u.id, "5001", { equity: 9_500 }, new Date(at.getTime() + 2 * 864e5), deps)).toMatchObject({ stop: true, reason: "RISK_MAX" });
    await saveRiskRule(u.id, "5001", { accountSize: 9_000, dailyLossPct: 5, maxLossPct: 10, profitTargetPct: null, closeOnBreach: false });
    expect((await getRiskRule(u.id, "5001"))!.breach).toBeNull();
    expect(await applyRisk(u.id, "5001", { equity: 9_500 }, new Date(at.getTime() + 2 * 864e5), deps)).toEqual({ stop: false, closeAll: false });
  });

  it("does nothing without rules, and refuses nonsense settings", async () => {
    const u = await makeUser("a@x.mn");
    expect(await applyRisk(u.id, "5001", { equity: 1 }, at, deps)).toEqual({ stop: false, closeAll: false });
    expect((await saveRiskRule(u.id, "5001", { accountSize: 0, dailyLossPct: 5, maxLossPct: 10, profitTargetPct: null, closeOnBreach: true })).error).toBe("accountSize");
    expect((await saveRiskRule(u.id, "5001", { accountSize: 10_000, dailyLossPct: 60, maxLossPct: 10, profitTargetPct: null, closeOnBreach: true })).error).toBe("dailyLossPct");
    expect((await saveRiskRule(u.id, "5001", { accountSize: 10_000, dailyLossPct: 5, maxLossPct: 3, profitTargetPct: null, closeOnBreach: true })).error).toBe("maxLossPct");
  });
});
