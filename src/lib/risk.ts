import "./i18n.server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { deliver } from "./telegram";
import { sendPush, type PushMessage } from "./push";
import { prefsOf } from "./prefsDb";
import { viewer, type Viewer } from "./viewer";
import { findUserById } from "./users";

/**
 * The risk manager ("prop firm mode"). A member sets, per MT5 account, the account size and two loss limits as % of
 * it: today's loss (measured from the equity at the day's first report, UTC day) and the overall loss (measured from
 * the account size, like FTMO's static drawdown). At 80% of a limit they are told once; at 100% the bot is stopped,
 * and its trades closed if they asked for that. A daily breach clears the next day; an overall breach holds until
 * they change the rules. An optional profit target is announced once when reached.
 */

export type RiskRule = {
  accountSize: number; dailyLossPct: number; maxLossPct: number; profitTargetPct: number | null; closeOnBreach: boolean;
  dayKey: string; dayStartEquity: number; warned: string; breach: string | null;
};
export type RiskInput = Pick<RiskRule, "accountSize" | "dailyLossPct" | "maxLossPct" | "profitTargetPct" | "closeOnBreach">;
export type RiskEvent = "daily_warn" | "daily_breach" | "max_warn" | "max_breach" | "target";
export const WARN_AT = 0.8;

/** Common challenge rules, to fill the form in one click. */
export const PRESETS: { id: string; name: string; dailyLossPct: number; maxLossPct: number; profitTargetPct: number | null }[] = [
  { id: "ftmo", name: "FTMO", dailyLossPct: 5, maxLossPct: 10, profitTargetPct: 10 },
  { id: "the5ers", name: "The5ers", dailyLossPct: 5, maxLossPct: 10, profitTargetPct: 8 },
  { id: "fundednext", name: "FundedNext", dailyLossPct: 5, maxLossPct: 10, profitTargetPct: 10 },
  { id: "careful", name: "2% / 6%", dailyLossPct: 2, maxLossPct: 6, profitTargetPct: null },
];

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const pctOf = (used: number, limit: number) => (limit > 0 ? Math.max(0, Math.round((used / limit) * 100)) : 0);

/** Where the account stands against its limits now, and which limits it just reached. */
export function riskReading(rule: RiskRule, equity: number, now: Date) {
  const dayKey = dayOf(now);
  const dayStartEquity = rule.dayKey === dayKey && rule.dayStartEquity > 0 ? rule.dayStartEquity : equity;
  const dLimit = rule.accountSize * rule.dailyLossPct / 100;
  const mLimit = rule.accountSize * rule.maxLossPct / 100;
  const dUsed = Math.max(0, dayStartEquity - equity);
  const mUsed = Math.max(0, rule.accountSize - equity);
  const goal = rule.profitTargetPct ? rule.accountSize * rule.profitTargetPct / 100 : 0;
  const made = equity - rule.accountSize;
  const events: RiskEvent[] = [];
  if (mUsed >= mLimit) events.push("max_breach");
  else if (mUsed >= mLimit * WARN_AT) events.push("max_warn");
  if (dUsed >= dLimit) events.push("daily_breach");
  else if (dUsed >= dLimit * WARN_AT) events.push("daily_warn");
  if (goal > 0 && made >= goal) events.push("target");
  return {
    dayKey, dayStartEquity,
    daily: { used: round(dUsed), limit: round(dLimit), pct: pctOf(dUsed, dLimit) },
    max: { used: round(mUsed), limit: round(mLimit), pct: pctOf(mUsed, mLimit) },
    target: goal > 0 ? { made: round(made), goal: round(goal), pct: Math.min(100, pctOf(made, goal)) } : null,
    events,
  };
}
const round = (x: number) => Math.round(x * 100) / 100;

/**
 * Every robot report checks its account's rule, so rules are kept in memory for a short while (per server instance).
 * Saving or removing a rule here forgets it at once; on other instances it is re-read within ruleTtlMs.
 * Swapped in tests (0 = always read).
 */
export const riskTiming = { ruleTtlMs: process.env.NODE_ENV === "test" ? 0 : 30_000 };
const ruleMemo = new Map<string, { at: number; rule: RiskRule | null }>();
const MAX_MEMO = 10_000;
const memoKey = (userId: string, login: string) => `${userId}:${login}`;
export const forgetRiskRule = (userId: string, login: string) => { ruleMemo.delete(memoKey(userId, login)); };
export const forgetRiskRules = () => ruleMemo.clear();
function remember(userId: string, login: string, rule: RiskRule | null): void {
  const key = memoKey(userId, login);
  ruleMemo.delete(key);
  ruleMemo.set(key, { at: Date.now(), rule });
  while (ruleMemo.size > MAX_MEMO) ruleMemo.delete(ruleMemo.keys().next().value as string);
}
async function cachedRule(userId: string, login: string): Promise<RiskRule | null> {
  const hit = ruleMemo.get(memoKey(userId, login));
  if (hit && Date.now() - hit.at < riskTiming.ruleTtlMs) return hit.rule;
  const rule = await getRiskRule(userId, login);
  if (riskTiming.ruleTtlMs > 0) remember(userId, login, rule);
  return rule;
}

export type RiskError = "accountSize" | "dailyLossPct" | "maxLossPct" | "profitTargetPct";
export async function saveRiskRule(userId: string, login: string, input: RiskInput): Promise<{ error?: RiskError }> {
  const ok = (x: number, lo: number, hi: number) => Number.isFinite(x) && x > lo && x <= hi;
  if (!ok(input.accountSize, 0, 1e9)) return { error: "accountSize" };
  if (!ok(input.dailyLossPct, 0, 50)) return { error: "dailyLossPct" };
  if (!ok(input.maxLossPct, 0, 100) || input.maxLossPct < input.dailyLossPct) return { error: "maxLossPct" };
  if (input.profitTargetPct !== null && !ok(input.profitTargetPct, 0, 1000)) return { error: "profitTargetPct" };
  const values = { ...input, breach: null, warned: "", updatedAt: new Date() };
  await db.insert(schema.riskRules).values({ userId, login, ...values })
    .onConflictDoUpdate({ target: [schema.riskRules.userId, schema.riskRules.login], set: values });
  forgetRiskRule(userId, login);
  return {};
}

export async function deleteRiskRule(userId: string, login: string): Promise<void> {
  await db.delete(schema.riskRules).where(and(eq(schema.riskRules.userId, userId), eq(schema.riskRules.login, login)));
  forgetRiskRule(userId, login);
}

export async function getRiskRule(userId: string, login: string): Promise<RiskRule | null> {
  const [r] = await db.select().from(schema.riskRules).where(and(eq(schema.riskRules.userId, userId), eq(schema.riskRules.login, login)));
  return r ? { accountSize: r.accountSize, dailyLossPct: r.dailyLossPct, maxLossPct: r.maxLossPct, profitTargetPct: r.profitTargetPct, closeOnBreach: r.closeOnBreach, dayKey: r.dayKey, dayStartEquity: r.dayStartEquity, warned: r.warned, breach: r.breach } : null;
}

const usd = (x: number) => `$${Math.abs(x).toFixed(2)}`;
/** The notice for an event (Telegram HTML; the first line is the notification title). */
export function riskText(e: RiskEvent, r: ReturnType<typeof riskReading>, closeOnBreach: boolean, v: Viewer): string {
  const { t } = v;
  switch (e) {
    case "daily_warn": return [t("⚠️ <b>Өдрийн алдагдлын хязгаарын 80%-иас давлаа</b>", "⚠️ <b>Past 80% of today's loss limit</b>"), t(`Өнөөдөр −${usd(r.daily.used)} / ${usd(r.daily.limit)}. Хязгаарт хүрвэл робот өнөөдөртөө зогсоно.`, `Today −${usd(r.daily.used)} of ${usd(r.daily.limit)}. At the limit the robot stops for the day.`)].join("\n");
    case "max_warn": return [t("⚠️ <b>Нийт алдагдлын хязгаарын 80%-иас давлаа</b>", "⚠️ <b>Past 80% of the overall loss limit</b>"), t(`Нийт −${usd(r.max.used)} / ${usd(r.max.limit)}.`, `Overall −${usd(r.max.used)} of ${usd(r.max.limit)}.`)].join("\n");
    case "daily_breach": return [t("⛔ <b>Өдрийн алдагдлын хязгаарт хүрлээ</b>", "⛔ <b>Today's loss limit reached</b>"), t(`Өнөөдөр −${usd(r.daily.used)}. Робот өнөөдөртөө зогслоо${closeOnBreach ? ", нээлттэй арилжааг нь хааж байна" : ""}. Маргааш дахин асааж болно.`, `Today −${usd(r.daily.used)}. The robot has stopped for the day${closeOnBreach ? " and is closing its open trades" : ""}. It can run again tomorrow.`)].join("\n");
    case "max_breach": return [t("⛔ <b>Нийт алдагдлын хязгаарт хүрлээ</b>", "⛔ <b>Overall loss limit reached</b>"), t(`Нийт −${usd(r.max.used)}. Робот зогслоо${closeOnBreach ? ", нээлттэй арилжааг нь хааж байна" : ""}. Дүрмээ шинэчилтэл дахин асахгүй.`, `Overall −${usd(r.max.used)}. The robot has stopped${closeOnBreach ? " and is closing its open trades" : ""}. It stays off until you update the rules.`)].join("\n");
    case "target": return [t("🎯 <b>Ашгийн зорилтод хүрлээ</b>", "🎯 <b>Profit target reached</b>"), t(`+${usd(r.target?.made ?? 0)} / ${usd(r.target?.goal ?? 0)}.`, `+${usd(r.target?.made ?? 0)} of ${usd(r.target?.goal ?? 0)}.`)].join("\n");
  }
}

type Deps = { send?: (chat: string, html: string) => Promise<boolean>; push?: (userId: string, msg: PushMessage) => Promise<number> };
export type RiskVerdict = { stop: boolean; closeAll: boolean; reason?: "RISK_DAILY" | "RISK_MAX" };

type RiskState = Pick<RiskRule, "dayKey" | "dayStartEquity" | "warned" | "breach">;

/** The rule's day, warnings and breach after this reading, and the notices that are new. */
function nextState(rule: RiskRule, r: ReturnType<typeof riskReading>): { state: RiskState; fresh: RiskEvent[]; closeNow: boolean } {
  const warned = new Set(rule.warned.split(",").filter((w) => w && (!w.includes(":") || w.endsWith(`:${r.dayKey}`))));
  let breach = rule.breach === "RISK_MAX" || rule.breach === `RISK_DAILY:${r.dayKey}` ? rule.breach : null;
  const fresh: RiskEvent[] = [];
  let closeNow = false;
  if (!breach) {
    if (r.events.includes("max_breach")) { breach = "RISK_MAX"; fresh.push("max_breach"); closeNow = rule.closeOnBreach; }
    else if (r.events.includes("daily_breach")) { breach = `RISK_DAILY:${r.dayKey}`; fresh.push("daily_breach"); closeNow = rule.closeOnBreach; }
  }
  if (!breach) {
    if (r.events.includes("daily_warn") && !warned.has(`daily:${r.dayKey}`)) { warned.add(`daily:${r.dayKey}`); fresh.push("daily_warn"); }
    if (r.events.includes("max_warn") && !warned.has("max")) { warned.add("max"); fresh.push("max_warn"); }
  }
  if (r.events.includes("target") && !warned.has("target")) { warned.add("target"); fresh.push("target"); }
  return { state: { dayKey: r.dayKey, dayStartEquity: r.dayStartEquity, warned: [...warned].join(","), breach }, fresh, closeNow };
}

const sameState = (a: RiskState, b: RiskState) => a.dayKey === b.dayKey && a.dayStartEquity === b.dayStartEquity && a.warned === b.warned && a.breach === b.breach;

/**
 * On each robot report: update the day, send what is new, and say whether the bot must stop (and close).
 * Nothing is written while nothing changes. A change is written only if the row still holds what this reading started
 * from, so when two server instances see the same breach at once, only the one whose write lands sends the notice;
 * the other reads the rule again and finds nothing new.
 */
export async function applyRisk(userId: string, login: string, account: { equity: number }, now: Date, deps: Deps = {}): Promise<RiskVerdict> {
  let rule = await cachedRule(userId, login);
  if (!rule || !(account.equity > 0)) return { stop: false, closeAll: false };
  let r = riskReading(rule, account.equity, now);
  let next = nextState(rule, r);
  for (let attempt = 0; !sameState(next.state, rule) && attempt < 2; attempt++) {
    const rr = schema.riskRules;
    const [won] = await db.update(rr).set({ ...next.state, updatedAt: now })
      .where(and(
        eq(rr.userId, userId), eq(rr.login, login),
        eq(rr.dayKey, rule.dayKey), eq(rr.dayStartEquity, rule.dayStartEquity), eq(rr.warned, rule.warned),
        rule.breach === null ? isNull(rr.breach) : eq(rr.breach, rule.breach),
      )).returning({ one: sql<number>`1` });
    if (won) {
      const saved: RiskRule = { ...rule, ...next.state };
      if (riskTiming.ruleTtlMs > 0) remember(userId, login, saved);
      rule = saved;
      await announce(userId, next.fresh, r, rule.closeOnBreach, deps);
      break;
    }
    // changed elsewhere (another instance, or the member saved new rules): start again from what is stored
    forgetRiskRule(userId, login);
    const stored = await cachedRule(userId, login);
    if (!stored) return { stop: false, closeAll: false };
    rule = stored;
    r = riskReading(rule, account.equity, now);
    next = nextState(rule, r);
    if (sameState(next.state, rule)) break;
  }
  const breach = next.state.breach;
  if (!breach) return { stop: false, closeAll: false };
  return { stop: true, closeAll: next.closeNow, reason: breach === "RISK_MAX" ? "RISK_MAX" : "RISK_DAILY" };
}

async function announce(userId: string, fresh: RiskEvent[], r: ReturnType<typeof riskReading>, closeOnBreach: boolean, deps: Deps): Promise<void> {
  if (!fresh.length) return;
  const u = await findUserById(userId);
  if (!u) return;
  const v = viewer(prefsOf(u));
  for (const e of fresh) {
    const html = riskText(e, r, closeOnBreach, v);
    if (u.telegramChatId) await (deps.send ?? deliver)(u.telegramChatId, html).catch(() => false);
    const [title, body] = html.split("\n").map((l) => l.replace(/<[^>]+>/g, ""));
    await (deps.push ?? sendPush)(userId, { title, body, url: "/bot#risk", tag: `risk-${e}` }).catch(() => 0);
  }
}
