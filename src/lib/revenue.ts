import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { Role } from "./db/schema";
import { PLAN_IDS } from "./plans";

/** Stands in for the payer of a payment whose account was deleted. */
export const DELETED_PAYER = "(deleted)";

/**
 * The admin's revenue view, worked out from paid payments and users. Months are counted on the Ulaanbaatar clock
 * (UTC+8, no daylight saving), so a payment at 23:30 on the 30th lands in that month.
 */
export type PaidRow = { userId: string; plan: string; amount: number; paidAt: Date; accessUntil: Date | null };
export type UserRow = { id: string; email: string; role: Role; accessUntil: Date | null; createdAt?: Date };
/** People who registered in a month, and how many of them have paid at any time since. */
export type SignupMonth = { key: string; signups: number; paid: number; paidPct: number | null };
export type Month = { key: string; revenue: number; payments: number; newPayers: number; renewals: number };

const DAY = 864e5;
const UB_OFFSET_MS = 8 * 36e5;
const DUE_WINDOW_DAYS = 30;
const SOON_DAYS = 7;
const MONTHS = 6;

export const ubMonth = (t: Date) => new Date(t.getTime() + UB_OFFSET_MS).toISOString().slice(0, 7);
function monthsBack(key: string, n: number): string[] {
  const [y, m] = key.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export function revenueReport(paid: readonly PaidRow[], users: readonly UserRow[], now: Date) {
  const customers = users.filter((u) => u.role !== "ADMIN");
  const byId = new Map(customers.map((u) => [u.id, u]));
  const sorted = [...paid].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  const firstPaid = new Map<string, Date>();
  for (const p of sorted) if (!firstPaid.has(p.userId)) firstPaid.set(p.userId, p.paidAt);

  const months = new Map<string, Month>();
  const thisKey = ubMonth(now);
  const keys = monthsBack(thisKey, MONTHS);
  for (const k of keys) months.set(k, { key: k, revenue: 0, payments: 0, newPayers: 0, renewals: 0 });
  const monthOf = (k: string) => months.get(k) ?? { key: k, revenue: 0, payments: 0, newPayers: 0, renewals: 0 };
  for (const p of sorted) {
    const m = months.get(ubMonth(p.paidAt));
    if (!m) continue;
    m.revenue += p.amount;
    m.payments++;
    if (firstPaid.get(p.userId)?.getTime() === p.paidAt.getTime()) m.newPayers++; else m.renewals++;
  }

  const t = now.getTime();
  const active = customers.filter((u) => u.accessUntil && u.accessUntil.getTime() > t);
  const endingSoon = active.filter((u) => u.accessUntil!.getTime() <= t + SOON_DAYS * DAY)
    .sort((a, b) => a.accessUntil!.getTime() - b.accessUntil!.getTime())
    .map((u) => ({ email: u.email, until: u.accessUntil! }));

  // A plan came due when the end it bought fell in the last 30 days. Renewed: access now runs past that end.
  const dueEnd = new Map<string, number>();
  for (const p of paid) {
    const end = p.accessUntil?.getTime();
    if (end === undefined || end > t || end <= t - DUE_WINDOW_DAYS * DAY || !byId.has(p.userId)) continue;
    dueEnd.set(p.userId, Math.max(dueEnd.get(p.userId) ?? 0, end));
  }
  const left: { email: string; until: Date }[] = [];
  let renewed = 0;
  for (const [id, end] of dueEnd) {
    const u = byId.get(id)!;
    if (u.accessUntil && u.accessUntil.getTime() > end) renewed++;
    else left.push({ email: u.email, until: new Date(end) });
  }
  left.sort((a, b) => b.until.getTime() - a.until.getTime());

  const payers = new Set(paid.map((p) => p.userId)).size;

  // The user flow: who registered when, and how far each got (paid once, paid again, still active).
  const payCount = new Map<string, number>();
  for (const p of paid) payCount.set(p.userId, (payCount.get(p.userId) ?? 0) + 1);
  const signups = new Map<string, SignupMonth>(keys.map((k) => [k, { key: k, signups: 0, paid: 0, paidPct: null }]));
  for (const u of customers) {
    const m = u.createdAt ? signups.get(ubMonth(u.createdAt)) : undefined;
    if (!m) continue;
    m.signups++;
    if (payCount.has(u.id)) m.paid++;
  }
  for (const m of signups.values()) m.paidPct = m.signups ? Math.round((m.paid / m.signups) * 100) : null;
  const funnel = {
    registered: customers.length,
    paid: customers.filter((u) => payCount.has(u.id)).length,
    repeat: customers.filter((u) => (payCount.get(u.id) ?? 0) > 1).length,
    active: active.length,
  };
  const revenue = paid.reduce((s, p) => s + p.amount, 0);
  return {
    thisMonth: monthOf(thisKey),
    lastMonth: monthOf(keys[keys.length - 2]),
    months: keys.map((k) => months.get(k)!),
    active: active.length,
    endingSoon,
    cameDue: dueEnd.size,
    renewed,
    left,
    renewalPct: dueEnd.size ? Math.round((renewed / dueEnd.size) * 100) : null,
    signups: keys.map((k) => signups.get(k)!),
    funnel,
    allTime: { revenue, payments: paid.length, payers, registered: customers.length, payingPct: customers.length ? Math.round((payers / customers.length) * 100) : 0 },
    plans: PLAN_IDS.map((plan) => {
      const rows = paid.filter((p) => p.plan === plan);
      return { plan, payments: rows.length, revenue: rows.reduce((s, p) => s + p.amount, 0) };
    }),
  };
}
export type RevenueReport = ReturnType<typeof revenueReport>;

/**
 * Loads every paid payment and every user, and builds the report (admins only). Small tables: a few thousand rows at most.
 * A payment whose account was since deleted still counts as money in, under one "deleted account" payer.
 */
export async function getRevenue(now: Date): Promise<RevenueReport> {
  await (await import("./auth")).requireAdmin(); // loaded on call: this module is also used where next-auth is not
  const [paid, users] = await Promise.all([
    db.select({ userId: schema.payments.userId, plan: schema.payments.plan, amount: schema.payments.amount, paidAt: schema.payments.paidAt, accessUntil: schema.payments.accessUntil })
      .from(schema.payments).where(eq(schema.payments.status, "PAID")),
    db.select({ id: schema.users.id, email: schema.users.email, role: schema.users.role, accessUntil: schema.users.accessUntil, createdAt: schema.users.createdAt }).from(schema.users),
  ]);
  const rows = paid.flatMap((p) => (p.paidAt ? [{ ...p, userId: p.userId ?? DELETED_PAYER, paidAt: p.paidAt }] : []));
  return revenueReport(rows, users, now);
}
