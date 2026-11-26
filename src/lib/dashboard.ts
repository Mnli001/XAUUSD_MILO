import { and, desc, eq, gte, sum } from "drizzle-orm";
import { db, schema } from "./db";
import type { Role } from "./db/schema";
import { tradePnl, type TradeInput } from "./analysis/journal";
import { isPlanId, type PlanId } from "./plans";
import { ONLINE_WITHIN_MS } from "./bot/liveDb";

/** The personal strip at the top of Today: the plan, the journal, the bot. Read-only: loading it writes nothing. */
const DAY = 864e5;
const MONTH_DAYS = 30;

export type PlanSummary =
  | { kind: "admin" }
  | { kind: "active"; plan: PlanId | null; until: Date; daysLeft: number }
  | { kind: "expired"; until: Date }
  | { kind: "none" };

export function planSummary(user: { role: Role; accessUntil: Date | null }, plan: PlanId | null, now: Date): PlanSummary {
  if (user.role === "ADMIN") return { kind: "admin" };
  const until = user.accessUntil;
  if (!until) return { kind: "none" };
  if (until.getTime() <= now.getTime()) return { kind: "expired", until };
  return { kind: "active", plan, until, daysLeft: Math.ceil((until.getTime() - now.getTime()) / DAY) };
}

/** The plan of this user's newest paid payment, or null (none, or access given by the admin). */
export async function latestPaidPlan(userId: string): Promise<PlanId | null> {
  const [p] = await db.select({ plan: schema.payments.plan }).from(schema.payments)
    .where(and(eq(schema.payments.userId, userId), eq(schema.payments.status, "PAID")))
    .orderBy(desc(schema.payments.paidAt)).limit(1);
  return p && isPlanId(p.plan) ? p.plan : null;
}

export type JournalSummary = {
  month: { closed: number; wins: number; losses: number; pnl: number; winRate: number | null };
  allTime: { closed: number; pnl: number };
  open: number;
};

/** Closed trades of the last 30 days (by close time), everything closed, and what is still open. */
export function journalSummary(trades: TradeInput[], now: Date): JournalSummary {
  const since = now.getTime() - MONTH_DAYS * DAY;
  const out: JournalSummary = { month: { closed: 0, wins: 0, losses: 0, pnl: 0, winRate: null }, allTime: { closed: 0, pnl: 0 }, open: 0 };
  for (const t of trades) {
    const pnl = tradePnl(t);
    if (pnl === null) { out.open++; continue; }
    out.allTime.closed++;
    out.allTime.pnl += pnl;
    if (t.closedAt!.getTime() >= since) {
      out.month.closed++;
      out.month.pnl += pnl;
      if (pnl > 0) out.month.wins++; else out.month.losses++;
    }
  }
  if (out.month.closed > 0) out.month.winRate = Math.round((out.month.wins / out.month.closed) * 100);
  out.month.pnl = Math.round(out.month.pnl * 100) / 100;
  out.allTime.pnl = Math.round(out.allTime.pnl * 100) / 100;
  return out;
}

export type BotSummary = { connected: boolean; running: boolean; online: boolean; positions: number; pnl24h: number; account: string | null };

/** The bot of the account heard from most recently. Unlike the bot page, this never creates a bot row. */
export async function botSummary(userId: string, now: Date): Promise<BotSummary> {
  const [token] = await db.select({ h: schema.botTokens.tokenHash }).from(schema.botTokens).where(eq(schema.botTokens.userId, userId));
  const rows = await db.select().from(schema.botLive).where(eq(schema.botLive.userId, userId));
  const live = rows.sort((a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0))[0];
  if (!live) return { connected: !!token?.h, running: false, online: false, positions: 0, pnl24h: 0, account: null };
  const [{ total }] = await db.select({ total: sum(schema.botDeals.profit) }).from(schema.botDeals)
    .where(and(eq(schema.botDeals.userId, userId), eq(schema.botDeals.login, live.login), gte(schema.botDeals.closeTime, new Date(now.getTime() - DAY))));
  const positions = (live.status as { positions?: unknown[] } | null)?.positions;
  return {
    connected: !!token?.h,
    running: live.state === "RUNNING",
    online: !!live.lastSeenAt && now.getTime() - live.lastSeenAt.getTime() <= ONLINE_WITHIN_MS,
    positions: Array.isArray(positions) ? positions.length : 0,
    pnl24h: Math.round(Number(total ?? 0) * 100) / 100,
    account: live.login || null,
  };
}
