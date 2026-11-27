import "./i18n.server";
import { and, eq } from "drizzle-orm";
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
  return {};
}

export async function deleteRiskRule(userId: string, login: string): Promise<void> {
  await db.delete(schema.riskRules).where(and(eq(schema.riskRules.userId, userId), eq(schema.riskRules.login, login)));
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
    case "daily_warn": return [t("⚠️ <b>Өдрийн алдагдлын хязгаарын 80%-иас давлаа</b>", "⚠️ <b>Past 80% of today's loss limit</b>"), t(`Өнөөдөр −${usd(r.daily.used)} / ${usd(r.daily.limit)}. Хязгаарт хүрвэл бот өнөөдөртөө зогсоно.`, `Today −${usd(r.daily.used)} of ${usd(r.daily.limit)}. At the limit the bot stops for the day.`)].join("\n");
    case "max_warn": return [t("⚠️ <b>Нийт алдагдлын хязгаарын 80%-иас давлаа</b>", "⚠️ <b>Past 80% of the overall loss limit</b>"), t(`Нийт −${usd(r.max.used)} / ${usd(r.max.limit)}.`, `Overall −${usd(r.max.used)} of ${usd(r.max.limit)}.`)].join("\n");
    case "daily_breach": return [t("⛔ <b>Өдрийн алдагдлын хязгаарт хүрлээ</b>", "⛔ <b>Today's loss limit reached</b>"), t(`Өнөөдөр −${usd(r.daily.used)}. Бот өнөөдөртөө зогслоо${closeOnBreach ? ", нээлттэй арилжааг нь хааж байна" : ""}. Маргааш дахин асааж болно.`, `Today −${usd(r.daily.used)}. The bot has stopped for the day${closeOnBreach ? " and is closing its open trades" : ""}. It can run again tomorrow.`)].join("\n");
    case "max_breach": return [t("⛔ <b>Нийт алдагдлын хязгаарт хүрлээ</b>", "⛔ <b>Overall loss limit reached</b>"), t(`Нийт −${usd(r.max.used)}. Бот зогслоо${closeOnBreach ? ", нээлттэй арилжааг нь хааж байна" : ""}. Дүрмээ шинэчилтэл дахин асахгүй.`, `Overall −${usd(r.max.used)}. The bot has stopped${closeOnBreach ? " and is closing its open trades" : ""}. It stays off until you update the rules.`)].join("\n");
    case "target": return [t("🎯 <b>Ашгийн зорилтод хүрлээ</b>", "🎯 <b>Profit target reached</b>"), t(`+${usd(r.target?.made ?? 0)} / ${usd(r.target?.goal ?? 0)}.`, `+${usd(r.target?.made ?? 0)} of ${usd(r.target?.goal ?? 0)}.`)].join("\n");
  }
}

type Deps = { send?: (chat: string, html: string) => Promise<boolean>; push?: (userId: string, msg: PushMessage) => Promise<number> };
export type RiskVerdict = { stop: boolean; closeAll: boolean; reason?: "RISK_DAILY" | "RISK_MAX" };

/** On each robot report: update the day, send what is new, and say whether the bot must stop (and close). */
export async function applyRisk(userId: string, login: string, account: { equity: number }, now: Date, deps: Deps = {}): Promise<RiskVerdict> {
  const rule = await getRiskRule(userId, login);
  if (!rule || !(account.equity > 0)) return { stop: false, closeAll: false };
  const r = riskReading(rule, account.equity, now);
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
  await db.update(schema.riskRules).set({ dayKey: r.dayKey, dayStartEquity: r.dayStartEquity, warned: [...warned].join(","), breach, updatedAt: now })
    .where(and(eq(schema.riskRules.userId, userId), eq(schema.riskRules.login, login)));
  if (fresh.length) {
    const u = await findUserById(userId);
    if (u) {
      const v = viewer(prefsOf(u));
      for (const e of fresh) {
        const html = riskText(e, r, rule.closeOnBreach, v);
        if (u.telegramChatId) await (deps.send ?? deliver)(u.telegramChatId, html).catch(() => false);
        const [title, body] = html.split("\n").map((l) => l.replace(/<[^>]+>/g, ""));
        await (deps.push ?? sendPush)(userId, { title, body, url: "/bot#risk", tag: `risk-${e}` }).catch(() => 0);
      }
    }
  }
  if (!breach) return { stop: false, closeAll: false };
  return { stop: true, closeAll: closeNow, reason: breach === "RISK_MAX" ? "RISK_MAX" : "RISK_DAILY" };
}
