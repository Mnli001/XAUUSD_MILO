import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";
import { fakeWire } from "../helpers/wireFetch";
const requireAdmin = vi.fn(async () => ({ id: "admin", role: "ADMIN" }));
vi.mock("@/lib/auth", () => ({ requireAdmin: () => requireAdmin() }));
import { startPayment, refreshPayment, refreshByRef, paymentFor, listPayments, paymentsOf, markRefunded, PAY_TTL_MS } from "@/lib/payments";
import { deleteAccount } from "@/lib/account";
import bcrypt from "bcryptjs";
import type { WireConfig } from "@/lib/wire";

const cfg: WireConfig = { baseUrl: "https://api.wire.mn", apiKey: "sk_live_test", webhookSecret: "whsec_s" };
const SITE = "https://site.mn";
const DAY = 864e5;
const now = new Date("2026-11-26T10:00:00Z");
const accessOf = async (id: string) => (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0].accessUntil;
const countPayments = async () => (await db.select().from(schema.payments)).length;

beforeEach(async () => { await resetDb(); });
afterEach(() => vi.unstubAllGlobals());

describe("startPayment", () => {
  it("creates a Wire intent for the plan's price, opens its hosted checkout, and stores both as pending", async () => {
    const w = fakeWire();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    expect(p).toMatchObject({ userId: u.id, plan: "PLUS", amount: 50000, days: 30, status: "PENDING", providerRef: "pi_1", checkoutUrl: "https://pay.wire.mn/c/cs_1" });
    expect(p.expiresAt.getTime()).toBe(now.getTime() + PAY_TTL_MS);
    const intent = w.calls.find((c) => c.url.endsWith("/v1/payment_intents"))!;
    expect(intent.body).toMatchObject({ amount: 50000, currency: "MNT", expires_at: (now.getTime() + PAY_TTL_MS) / 1000, metadata: { payment: p.id, order: p.senderInvoiceNo } });
    expect(intent.headers["idempotency-key"]).toBe(`xau-${p.id}-intent`);
    const checkout = w.calls.find((c) => c.url.endsWith("/v1/checkout/sessions"))!;
    expect(checkout.body).toEqual({ payment_intent: "pi_1", success_url: `${SITE}/pay/${p.id}`, cancel_url: `${SITE}/plans` });
  });

  it("reuses the open payment when the same plan is chosen again, instead of making another", async () => {
    const w = fakeWire();
    const u = await makeUser("a@x.mn");
    const a = await startPayment(u.id, "PRO", now, cfg, SITE);
    const b = await startPayment(u.id, "PRO", new Date(now.getTime() + 60e3), cfg, SITE);
    expect(b.id).toBe(a.id);
    expect(w.calls.filter((c) => c.url.endsWith("/v1/payment_intents"))).toHaveLength(1);
  });

  it("starts a fresh one when the open payment has under five minutes left", async () => {
    fakeWire();
    const u = await makeUser("a@x.mn");
    const a = await startPayment(u.id, "PRO", now, cfg, SITE);
    const b = await startPayment(u.id, "PRO", new Date(now.getTime() + PAY_TTL_MS - 4 * 60e3), cfg, SITE);
    expect(b.id).not.toBe(a.id);
  });

  it("gives every payment its own order number", async () => {
    fakeWire();
    const u = await makeUser("a@x.mn");
    const a = await startPayment(u.id, "PLUS", now, cfg, SITE);
    const b = await startPayment(u.id, "MAX", now, cfg, SITE);
    expect(a.senderInvoiceNo).not.toBe(b.senderInvoiceNo);
  });

  it("stores nothing when Wire refuses the intent", async () => {
    const w = fakeWire();
    w.fail(403, "connector_required");
    const u = await makeUser("a@x.mn");
    await expect(startPayment(u.id, "PLUS", now, cfg, SITE)).rejects.toMatchObject({ code: "connector_required" });
    expect(await countPayments()).toBe(0);
  });

  it("cancels the intent and stores nothing when the checkout cannot be opened", async () => {
    const w = fakeWire({ checkoutUrl: "http://not-https.example" });
    const u = await makeUser("a@x.mn");
    await expect(startPayment(u.id, "PLUS", now, cfg, SITE)).rejects.toThrow();
    expect(await countPayments()).toBe(0);
    expect(w.intents.get("pi_1")!.status).toBe("canceled");
  });
});

describe("refreshPayment", () => {
  it("opens access for the plan's days once Wire says the intent succeeded for the full amount", async () => {
    const q = fakeWire();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    q.pay();
    const r = await refreshPayment(p.id, now, cfg, { force: true });
    expect(r).toMatchObject({ status: "PAID" });
    expect((await accessOf(u.id))!.getTime()).toBe(now.getTime() + 30 * DAY);
    expect(r!.accessUntil!.getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("extends only once when the page's check and the webhook arrive together", async () => {
    const q = fakeWire();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    q.pay();
    await Promise.all([refreshPayment(p.id, now, cfg, { force: true }), refreshPayment(p.id, now, cfg, { force: true }), refreshPayment(p.id, now, cfg, { force: true })]);
    expect((await accessOf(u.id))!.getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("a succeeded intent for less than the price opens nothing", async () => {
    const q = fakeWire();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    q.pay(undefined, 20000);
    expect((await refreshPayment(p.id, now, cfg, { force: true }))!.status).toBe("PENDING");
    expect(await accessOf(u.id)).toBeNull();
  });

  it("expires an unpaid invoice after 30 minutes, checking once more first", async () => {
    const q = fakeWire();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    const later = new Date(now.getTime() + PAY_TTL_MS + 1000);
    const before = q.retrieves();
    expect((await refreshPayment(p.id, later, cfg, { force: true }))!.status).toBe("EXPIRED");
    expect(q.retrieves()).toBe(before + 1);
  });

  it("still honours money that arrives after the invoice expired", async () => {
    const q = fakeWire();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    const later = new Date(now.getTime() + PAY_TTL_MS + 1000);
    await refreshPayment(p.id, later, cfg, { force: true });
    q.pay();
    const r = await refreshPayment(p.id, later, cfg, { force: true });
    expect(r!.status).toBe("PAID");
    expect((await accessOf(u.id))!.getTime()).toBe(later.getTime() + 30 * DAY);
  });

  it("renewing while access still runs adds to its end", async () => {
    const q = fakeWire();
    const u = await makeUser("a@x.mn");
    const end = new Date(now.getTime() + 10 * DAY);
    await db.update(schema.users).set({ accessUntil: end }).where(eq(schema.users.id, u.id));
    const p = await startPayment(u.id, "MAX", now, cfg, SITE);
    q.pay();
    await refreshPayment(p.id, now, cfg, { force: true });
    expect((await accessOf(u.id))!.getTime()).toBe(end.getTime() + 365 * DAY);
  });

  it("does not ask Wire again within a few seconds unless forced", async () => {
    const q = fakeWire();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    await refreshPayment(p.id, now, cfg);
    await refreshPayment(p.id, new Date(now.getTime() + 1000), cfg);
    expect(q.retrieves()).toBe(1);
  });

  it("is null for an unknown id and makes no Wire call", async () => {
    const q = fakeWire();
    expect(await refreshPayment("nope", now, cfg, { force: true })).toBeNull();
    expect(q.retrieves()).toBe(0);
  });
});

describe("refreshPayment: Wire statuses", () => {
  it("expires the payment as soon as Wire says the intent was canceled", async () => {
    const q = fakeWire();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    q.setStatus("canceled");
    expect((await refreshPayment(p.id, now, cfg, { force: true }))!.status).toBe("EXPIRED");
    expect(await accessOf(u.id)).toBeNull();
  });
  it("stays pending while Wire is still processing", async () => {
    const q = fakeWire();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    q.setStatus("processing");
    expect((await refreshPayment(p.id, now, cfg, { force: true }))!.status).toBe("PENDING");
  });
});

describe("refreshByRef", () => {
  it("finds the payment by its Wire intent id and checks it", async () => {
    const q = fakeWire();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    q.pay();
    expect((await refreshByRef("pi_1", now, cfg))?.id).toBe(p.id);
    expect((await accessOf(u.id))!.getTime()).toBe(now.getTime() + 30 * DAY);
  });
  it("is null for an intent that is not ours, without asking Wire", async () => {
    const q = fakeWire();
    expect(await refreshByRef("pi_someone_else", now, cfg)).toBeNull();
    expect(q.retrieves()).toBe(0);
  });
});

describe("paymentFor and listPayments", () => {
  it("only the owner can read a payment", async () => {
    fakeWire();
    const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn");
    const p = await startPayment(a.id, "PLUS", now, cfg, SITE);
    expect((await paymentFor(p.id, a.id))?.id).toBe(p.id);
    expect(await paymentFor(p.id, b.id)).toBeNull();
  });
  it("lists payments newest first with the payer's email", async () => {
    fakeWire();
    const a = await makeUser("a@x.mn");
    await startPayment(a.id, "PLUS", now, cfg, SITE);
    const rows = await listPayments(10);
    expect(rows[0]).toMatchObject({ plan: "PLUS", email: "a@x.mn", status: "PENDING" });
  });
});

describe("admin-only listing", () => {
  it("listPayments checks the caller is an admin itself, not only the page", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
    await expect(listPayments(10)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("account deletion keeps the payment record", () => {
  it("cancels open payments at Wire, marks them EXPIRED, and keeps paid ones with no user", async () => {
    const w = fakeWire();
    const u = await makeUser("a@x.mn");
    await db.update(schema.users).set({ passwordHash: await bcrypt.hash("password1", 4) }).where(eq(schema.users.id, u.id));
    const paid = await startPayment(u.id, "PLUS", now, cfg, SITE);
    w.pay();
    await refreshPayment(paid.id, now, cfg, { force: true });
    const open = await startPayment(u.id, "PRO", now, cfg, SITE);
    // An active plan blocks deletion, so this is a member whose paid plan has since ended.
    expect((await deleteAccount(u.id, "password1", cfg, now)).error).toBe("active");
    await db.update(schema.users).set({ accessUntil: new Date(now.getTime() - 1000) }).where(eq(schema.users.id, u.id));
    expect(await deleteAccount(u.id, "password1", cfg, now)).toEqual({});
    const rows = await db.select().from(schema.payments);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.userId === null)).toBe(true);
    expect(rows.find((r) => r.id === paid.id)!.status).toBe("PAID");
    expect(rows.find((r) => r.id === open.id)!.status).toBe("EXPIRED");
    expect(w.intents.get(open.providerRef!)!.status).toBe("canceled");
    const listed = await listPayments(10);
    expect(listed.map((r) => r.email)).toEqual([null, null]); // the admin page shows them as a deleted account
  });
  it("money arriving after the account was deleted is flagged for the admin, not lost in an error", async () => {
    const w = fakeWire();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", now, cfg, SITE);
    await db.delete(schema.users).where(eq(schema.users.id, u.id)); // set null, not cascade
    w.pay();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await refreshPayment(p.id, now, cfg, { force: true });
    warn.mockRestore();
    expect(r).toMatchObject({ status: "PAID", userId: null });
    expect(r!.adminNote).toMatch(/deleted/);
  });
});

describe("refunds and chargebacks", () => {
  const paidFor = async (plan: "PLUS" | "PRO" = "PLUS") => {
    const w = fakeWire();
    const u = await makeUser(`${plan}@x.mn`);
    const p = await startPayment(u.id, plan, now, cfg, SITE);
    w.pay();
    await refreshPayment(p.id, now, cfg, { force: true });
    return { u, p };
  };
  it("marks the payment REFUNDED, takes back the days it bought, and notes it for the admin; repeats change nothing", async () => {
    const { u, p } = await paidFor();
    expect((await accessOf(u.id))!.getTime()).toBe(now.getTime() + 30 * DAY);
    const later = new Date(now.getTime() + 5 * DAY);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await markRefunded(p.providerRef!, later, { type: "charge.refunded" });
    expect(r).toMatchObject({ status: "REFUNDED", refundedAt: later });
    expect(r!.adminNote).toMatch(/moved back 30 days/);
    expect((await accessOf(u.id))!.getTime()).toBe(later.getTime()); // never earlier than now: access simply ends
    await markRefunded(p.providerRef!, later, { type: "charge.refunded" });
    expect((await accessOf(u.id))!.getTime()).toBe(later.getTime());
    warn.mockRestore();
  });
  it("only subtracts the refunded plan's days when the user has bought more since", async () => {
    const { u, p } = await paidFor();
    await db.update(schema.users).set({ accessUntil: new Date(now.getTime() + 210 * DAY) }).where(eq(schema.users.id, u.id));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await markRefunded(p.providerRef!, now, { type: "payment_intent.refunded" });
    warn.mockRestore();
    expect((await accessOf(u.id))!.getTime()).toBe(now.getTime() + 180 * DAY);
  });
  it("a partial refund is flagged but changes no access", async () => {
    const { u, p } = await paidFor();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await markRefunded(p.providerRef!, now, { type: "refund.succeeded", amount: 10000 });
    warn.mockRestore();
    expect(r!.status).toBe("REFUNDED");
    expect(r!.adminNote).toMatch(/partial/);
    expect((await accessOf(u.id))!.getTime()).toBe(now.getTime() + 30 * DAY);
  });
  it("an intent that is not ours is ignored", async () => {
    expect(await markRefunded("pi_unknown", now, { type: "charge.refunded" })).toBeNull();
  });
  it("a refunded payment stays REFUNDED when polled again while Wire still reports the intent as succeeded", async () => {
    const { u, p } = await paidFor();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const later = new Date(now.getTime() + 5 * DAY);
    await markRefunded(p.providerRef!, later, { type: "charge.refunded" });
    warn.mockRestore();
    const access = (await accessOf(u.id))!.getTime();
    const polled = new Date(later.getTime() + 60e3);
    const r = await refreshPayment(p.id, polled, cfg, { force: true });
    expect(r!.status).toBe("REFUNDED");
    expect(r!.paidAt).toEqual(now);
    await refreshByRef(p.providerRef!, polled, cfg);
    expect((await accessOf(u.id))!.getTime()).toBe(access);
    const [row] = await db.select().from(schema.payments).where(eq(schema.payments.id, p.id));
    expect(row.status).toBe("REFUNDED");
  });
});

describe("paymentsOf", () => {
  it("lists only this user's payments, newest first", async () => {
    fakeWire();
    const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn");
    await startPayment(a.id, "PLUS", now, cfg, SITE);
        await startPayment(b.id, "PRO", now, cfg, SITE);
        await startPayment(a.id, "MAX", new Date(now.getTime() + 1000), cfg, SITE);
    expect((await paymentsOf(a.id, 10)).map((p) => p.plan)).toEqual(["MAX", "PLUS"]);
  });
});
