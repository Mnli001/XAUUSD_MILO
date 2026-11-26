import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";
import { fakeQPay } from "../helpers/qpayFetch";
import { startPayment, refreshPayment, paymentFor, listPayments, paymentsOf, PAY_TTL_MS } from "@/lib/payments";
import { clearTokenCache, type QPayConfig } from "@/lib/qpay";

const cfg: QPayConfig = { baseUrl: "https://merchant-sandbox.qpay.mn", username: "TEST_MERCHANT", password: "123456", invoiceCode: "TEST_INVOICE" };
const SITE = "https://site.mn";
const DAY = 864e5;
const now = new Date("2026-11-26T10:00:00Z");
const accessOf = async (id: string) => (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0].accessUntil;

beforeEach(async () => { await resetDb(); clearTokenCache(); });
afterEach(() => vi.unstubAllGlobals());

describe("startPayment", () => {
  it("creates a QPay invoice for the plan's price and stores it as pending, with the QR and bank links", async () => {
    const q = fakeQPay({ invoiceId: "inv-1" });
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    expect(p).toMatchObject({ userId: u.id, plan: "PLUS", amount: 50000, days: 30, status: "PENDING", qpayInvoiceId: "inv-1", qrImage: "iVBORw0KGgo=" });
    expect(p.expiresAt.getTime()).toBe(now.getTime() + PAY_TTL_MS);
    const sent = q.calls.find((c) => c.url.endsWith("/v2/invoice"))!.body as { amount: number; callback_url: string };
    expect(sent.amount).toBe(50000);
    expect(sent.callback_url).toBe(`${SITE}/api/payments/qpay/callback?id=${p.id}`);
  });

  it("reuses the open invoice when the same plan is chosen again, instead of making another", async () => {
    const q = fakeQPay();
    const u = await makeUser("a@x.mn");
    const a = await startPayment(u.id, "PRO", now, cfg, SITE);
    const b = await startPayment(u.id, "PRO", new Date(now.getTime() + 60e3), cfg, SITE);
    expect(b.id).toBe(a.id);
    expect(q.calls.filter((c) => c.url.endsWith("/v2/invoice"))).toHaveLength(1);
  });

  it("gives every invoice its own sender number", async () => {
    fakeQPay();
    const u = await makeUser("a@x.mn");
    const a = await startPayment(u.id, "PLUS", now, cfg, SITE);
    fakeQPay({ invoiceId: "inv-2" });
    const b = await startPayment(u.id, "MAX", now, cfg, SITE);
    expect(a.senderInvoiceNo).not.toBe(b.senderInvoiceNo);
  });
});

describe("refreshPayment", () => {
  it("opens access for the plan's days once QPay says the full amount is paid", async () => {
    const q = fakeQPay();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    q.setPaid([{ id: "pay-1", amount: 50000 }]);
    const r = await refreshPayment(p.id, now, cfg, { force: true });
    expect(r).toMatchObject({ status: "PAID", qpayPaymentId: "pay-1" });
    expect((await accessOf(u.id))!.getTime()).toBe(now.getTime() + 30 * DAY);
    expect(r!.accessUntil!.getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("extends only once when the page's check and QPay's callback arrive together", async () => {
    const q = fakeQPay();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    q.setPaid([{ id: "pay-1", amount: 50000 }]);
    await Promise.all([refreshPayment(p.id, now, cfg, { force: true }), refreshPayment(p.id, now, cfg, { force: true }), refreshPayment(p.id, now, cfg, { force: true })]);
    expect((await accessOf(u.id))!.getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("a part payment opens nothing", async () => {
    const q = fakeQPay();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    q.setPaid([{ id: "pay-1", amount: 20000 }]);
    expect((await refreshPayment(p.id, now, cfg, { force: true }))!.status).toBe("PENDING");
    expect(await accessOf(u.id)).toBeNull();
  });

  it("expires an unpaid invoice after 30 minutes, checking once more first", async () => {
    const q = fakeQPay();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    const later = new Date(now.getTime() + PAY_TTL_MS + 1000);
    const before = q.checks();
    expect((await refreshPayment(p.id, later, cfg, { force: true }))!.status).toBe("EXPIRED");
    expect(q.checks()).toBe(before + 1);
  });

  it("still honours money that arrives after the invoice expired", async () => {
    const q = fakeQPay();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    const later = new Date(now.getTime() + PAY_TTL_MS + 1000);
    await refreshPayment(p.id, later, cfg, { force: true });
    q.setPaid([{ id: "pay-late", amount: 50000 }]);
    const r = await refreshPayment(p.id, later, cfg, { force: true });
    expect(r!.status).toBe("PAID");
    expect((await accessOf(u.id))!.getTime()).toBe(later.getTime() + 30 * DAY);
  });

  it("renewing while access still runs adds to its end", async () => {
    const q = fakeQPay();
    const u = await makeUser("a@x.mn");
    const end = new Date(now.getTime() + 10 * DAY);
    await db.update(schema.users).set({ accessUntil: end }).where(eq(schema.users.id, u.id));
    const p = await startPayment(u.id, "MAX", now, cfg, SITE);
    q.setPaid([{ id: "pay-1", amount: 300000 }]);
    await refreshPayment(p.id, now, cfg, { force: true });
    expect((await accessOf(u.id))!.getTime()).toBe(end.getTime() + 365 * DAY);
  });

  it("does not ask QPay again within a few seconds unless forced", async () => {
    const q = fakeQPay();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    await refreshPayment(p.id, now, cfg);
    await refreshPayment(p.id, new Date(now.getTime() + 1000), cfg);
    expect(q.checks()).toBe(1);
  });

  it("is null for an unknown id and makes no QPay call", async () => {
    const q = fakeQPay();
    expect(await refreshPayment("nope", now, cfg, { force: true })).toBeNull();
    expect(q.checks()).toBe(0);
  });
});

describe("paymentFor and listPayments", () => {
  it("only the owner can read a payment", async () => {
    fakeQPay();
    const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn");
    const p = await startPayment(a.id, "PLUS", now, cfg, SITE);
    expect((await paymentFor(p.id, a.id))?.id).toBe(p.id);
    expect(await paymentFor(p.id, b.id)).toBeNull();
  });
  it("lists payments newest first with the payer's email", async () => {
    fakeQPay();
    const a = await makeUser("a@x.mn");
    await startPayment(a.id, "PLUS", now, cfg, SITE);
    const rows = await listPayments(10);
    expect(rows[0]).toMatchObject({ plan: "PLUS", email: "a@x.mn", status: "PENDING" });
  });
});

describe("paymentsOf", () => {
  it("lists only this user's payments, newest first", async () => {
    fakeQPay();
    const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn");
    await startPayment(a.id, "PLUS", now, cfg, SITE);
    fakeQPay({ invoiceId: "inv-b" });
    await startPayment(b.id, "PRO", now, cfg, SITE);
    fakeQPay({ invoiceId: "inv-a2" });
    await startPayment(a.id, "MAX", new Date(now.getTime() + 1000), cfg, SITE);
    expect((await paymentsOf(a.id, 10)).map((p) => p.plan)).toEqual(["MAX", "PLUS"]);
  });
});
