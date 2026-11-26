import { randomUUID, randomBytes } from "node:crypto";
import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { Payment } from "./db/schema";
import { PLANS, extendAccess, type PlanId } from "./plans";
import { rewardReferrer } from "./referral";
import { notifyReferrer } from "./referralNotify";
import { cancelIntent, createCheckout, createIntent, retrieveIntent, type WireConfig } from "./wire";

/** How long one payment can be paid (Wire cancels the intent at the same moment). */
export const PAY_TTL_MS = 30 * 60e3;
/** The payment page asks every 5 seconds; Wire is asked at most this often per payment unless forced (the webhook). */
const MIN_CHECK_MS = 3000;
/** A pending payment for the same plan is reused while this much of its time is left. */
const REUSE_LEFT_MS = 5 * 60e3;

export type { Payment };

const orderNo = (now: Date) => `XAU-${now.getTime().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

/** Opens a Wire payment and its hosted checkout for a plan (or hands back the one still open for that plan). */
export async function startPayment(userId: string, plan: PlanId, now: Date, cfg: WireConfig, siteUrl: string): Promise<Payment> {
  const [open] = await db.select().from(schema.payments)
    .where(and(eq(schema.payments.userId, userId), eq(schema.payments.plan, plan), eq(schema.payments.status, "PENDING"), gt(schema.payments.expiresAt, new Date(now.getTime() + REUSE_LEFT_MS))))
    .orderBy(desc(schema.payments.createdAt)).limit(1);
  if (open?.checkoutUrl) return open;

  const p = PLANS[plan];
  const id = randomUUID();
  const order = orderNo(now);
  const expiresAt = new Date(now.getTime() + PAY_TTL_MS);
  const site = siteUrl.replace(/\/+$/, "");
  const intent = await createIntent(cfg, {
    amount: p.amount,
    description: `XAU Analytics · ${p.name} · ${order}`,
    expiresAt,
    metadata: { payment: id, order, user: userId, plan },
    idempotencyKey: `xau-${id}-intent`,
  });
  const cancel = () => cancelIntent(cfg, intent.id, `xau-${id}-cancel`).catch(() => {}); // nobody can pay what we could not record
  try {
    const checkout = await createCheckout(cfg, { paymentIntent: intent.id, successUrl: `${site}/pay/${id}`, cancelUrl: `${site}/plans`, idempotencyKey: `xau-${id}-checkout` });
    const [row] = await db.insert(schema.payments).values({
      id, userId, plan, amount: p.amount, days: p.days, status: "PENDING", senderInvoiceNo: order,
      providerRef: intent.id, checkoutUrl: checkout.url, createdAt: now, expiresAt,
    }).returning();
    return row;
  } catch (e) {
    await cancel();
    throw e;
  }
}

/** Marks a paid payment PAID and extends the payer's access, exactly once however many checks race here. */
async function activate(id: string, now: Date): Promise<void> {
  let rewarded: string | null = null;
  await db.transaction(async (tx) => {
    const [won] = await tx.update(schema.payments).set({ status: "PAID", paidAt: now })
      .where(and(eq(schema.payments.id, id), ne(schema.payments.status, "PAID"))).returning();
    if (!won) return; // another check got here first
    const [u] = await tx.execute<{ access_until: Date | string | null }>(sql`SELECT access_until FROM users WHERE id = ${won.userId} FOR UPDATE`).then((r) => r.rows);
    const current = u?.access_until ? new Date(u.access_until) : null;
    const until = extendAccess(current, now, won.days);
    await tx.update(schema.users).set({ accessUntil: until }).where(eq(schema.users.id, won.userId));
    await tx.update(schema.payments).set({ accessUntil: until }).where(eq(schema.payments.id, id));
    rewarded = await rewardReferrer(tx, won.userId, now);
  });
  if (rewarded) await notifyReferrer(rewarded).catch((e) => console.warn("[referral] could not tell the inviter", e));
}

/**
 * Asks Wire about a payment's intent and acts on the answer: succeeded for the full amount in tögrög → access opens;
 * canceled, or unpaid past its time → EXPIRED. An EXPIRED payment is still checked, so money that arrives late is honoured.
 * `force` skips the few-seconds throttle (the webhook).
 */
export async function refreshPayment(id: string, now: Date, cfg: WireConfig, o: { force?: boolean } = {}): Promise<Payment | null> {
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, id));
  if (!p) return null;
  if (p.status === "PAID" || !p.providerRef) return p;
  if (!o.force && p.checkedAt && now.getTime() - p.checkedAt.getTime() < MIN_CHECK_MS) return p;

  const r = await retrieveIntent(cfg, p.providerRef);
  await db.update(schema.payments).set({ checkedAt: now }).where(eq(schema.payments.id, id));
  if (r.status === "succeeded" && r.currency === "MNT" && r.amount >= p.amount) {
    await activate(id, now);
  } else if (p.status === "PENDING" && (r.status === "canceled" || now.getTime() >= p.expiresAt.getTime())) {
    await db.update(schema.payments).set({ status: "EXPIRED" }).where(and(eq(schema.payments.id, id), eq(schema.payments.status, "PENDING")));
  }
  const [fresh] = await db.select().from(schema.payments).where(eq(schema.payments.id, id));
  return fresh ?? null;
}

/** The webhook's way in: the payment whose Wire intent this is, checked now. Null when the intent is not ours. */
export async function refreshByRef(ref: string, now: Date, cfg: WireConfig): Promise<Payment | null> {
  const [p] = await db.select({ id: schema.payments.id }).from(schema.payments).where(eq(schema.payments.providerRef, ref));
  return p ? refreshPayment(p.id, now, cfg, { force: true }) : null;
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
