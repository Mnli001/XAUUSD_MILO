import { randomUUID, randomBytes } from "node:crypto";
import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { Payment } from "./db/schema";
import { PLANS, extendAccess, type PlanId } from "./plans";
import { cancelInvoice, checkInvoice, createInvoice, type BankLink, type QPayConfig } from "./qpay";

/** How long one of our invoices can be paid from the payment page. */
export const PAY_TTL_MS = 30 * 60e3;
/** The payment page asks every 5 seconds; QPay is asked at most this often per invoice unless forced (the callback). */
const MIN_CHECK_MS = 3000;
/** A pending invoice for the same plan is reused while this much of its time is left. */
const REUSE_LEFT_MS = 5 * 60e3;

export type { Payment };
export const bankLinks = (p: Payment): BankLink[] => (Array.isArray(p.urls) ? (p.urls as BankLink[]) : []);

const senderNo = (now: Date) => `XAU-${now.getTime().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

/** Opens a QPay invoice for a plan (or hands back the one still open for that plan). */
export async function startPayment(userId: string, plan: PlanId, now: Date, cfg: QPayConfig, siteUrl: string): Promise<Payment> {
  const [open] = await db.select().from(schema.payments)
    .where(and(eq(schema.payments.userId, userId), eq(schema.payments.plan, plan), eq(schema.payments.status, "PENDING"), gt(schema.payments.expiresAt, new Date(now.getTime() + REUSE_LEFT_MS))))
    .orderBy(desc(schema.payments.createdAt)).limit(1);
  if (open) return open;

  const p = PLANS[plan];
  const id = randomUUID();
  const sender = senderNo(now);
  const inv = await createInvoice(cfg, {
    senderInvoiceNo: sender,
    amount: p.amount,
    description: `XAU Analytics · ${p.name} · ${p.days}`,
    callbackUrl: `${siteUrl.replace(/\/+$/, "")}/api/payments/qpay/callback?id=${id}`,
  });
  try {
    const [row] = await db.insert(schema.payments).values({
      id, userId, plan, amount: p.amount, days: p.days, status: "PENDING", senderInvoiceNo: sender,
      qpayInvoiceId: inv.invoiceId, qrImage: inv.qrImage, qrText: inv.qrText, shortUrl: inv.shortUrl, urls: inv.urls,
      createdAt: now, expiresAt: new Date(now.getTime() + PAY_TTL_MS),
    }).returning();
    return row;
  } catch (e) {
    await cancelInvoice(cfg, inv.invoiceId).catch(() => {}); // nobody can pay an invoice we could not record
    throw e;
  }
}

/** Marks a paid invoice PAID and extends the payer's access, exactly once however many checks race here. */
async function activate(id: string, now: Date, qpayPaymentId: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    const [won] = await tx.update(schema.payments).set({ status: "PAID", paidAt: now, qpayPaymentId })
      .where(and(eq(schema.payments.id, id), ne(schema.payments.status, "PAID"))).returning();
    if (!won) return; // another check got here first
    const [u] = await tx.execute<{ access_until: Date | string | null }>(sql`SELECT access_until FROM users WHERE id = ${won.userId} FOR UPDATE`).then((r) => r.rows);
    const current = u?.access_until ? new Date(u.access_until) : null;
    const until = extendAccess(current, now, won.days);
    await tx.update(schema.users).set({ accessUntil: until }).where(eq(schema.users.id, won.userId));
    await tx.update(schema.payments).set({ accessUntil: until }).where(eq(schema.payments.id, id));
  });
}

/**
 * Asks QPay about an invoice and acts on the answer: paid in full → access opens; unpaid past its time → EXPIRED
 * (after this last check). An EXPIRED invoice is still checked, so money that arrives late is honoured.
 * `force` skips the few-seconds throttle (QPay's callback).
 */
export async function refreshPayment(id: string, now: Date, cfg: QPayConfig, o: { force?: boolean } = {}): Promise<Payment | null> {
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, id));
  if (!p) return null;
  if (p.status === "PAID" || !p.qpayInvoiceId) return p;
  if (!o.force && p.checkedAt && now.getTime() - p.checkedAt.getTime() < MIN_CHECK_MS) return p;

  const r = await checkInvoice(cfg, p.qpayInvoiceId);
  await db.update(schema.payments).set({ checkedAt: now }).where(eq(schema.payments.id, id));
  if (r.paidAmount >= p.amount) {
    await activate(id, now, r.paymentId);
  } else if (p.status === "PENDING" && now.getTime() >= p.expiresAt.getTime()) {
    await db.update(schema.payments).set({ status: "EXPIRED" }).where(and(eq(schema.payments.id, id), eq(schema.payments.status, "PENDING")));
  }
  const [fresh] = await db.select().from(schema.payments).where(eq(schema.payments.id, id));
  return fresh ?? null;
}

/** The payment, only if it belongs to this user. */
export async function paymentFor(id: string, userId: string): Promise<Payment | null> {
  const [p] = await db.select().from(schema.payments).where(and(eq(schema.payments.id, id), eq(schema.payments.userId, userId)));
  return p ?? null;
}

/** Every payment, newest first, with the payer's email: for the admin. */
export async function listPayments(limit = 200) {
  return db.select({
    id: schema.payments.id, email: schema.users.email, plan: schema.payments.plan, amount: schema.payments.amount,
    status: schema.payments.status, createdAt: schema.payments.createdAt, paidAt: schema.payments.paidAt,
    accessUntil: schema.payments.accessUntil, senderInvoiceNo: schema.payments.senderInvoiceNo,
  }).from(schema.payments).innerJoin(schema.users, eq(schema.users.id, schema.payments.userId))
    .orderBy(desc(schema.payments.createdAt)).limit(limit);
}

/** This user's own payments, newest first, for the plans page. */
export async function paymentsOf(userId: string, limit = 10): Promise<Payment[]> {
  return db.select().from(schema.payments).where(eq(schema.payments.userId, userId)).orderBy(desc(schema.payments.createdAt)).limit(limit);
}
