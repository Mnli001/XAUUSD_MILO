import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";
import { fakeQPay } from "../helpers/qpayFetch";
import { startPayment } from "@/lib/payments";
import { clearTokenCache, type QPayConfig } from "@/lib/qpay";
import type { User } from "@/lib/db/schema";

let session: User | null = null;
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session }));
import { GET as callbackGET, POST as callbackPOST } from "@/app/api/payments/qpay/callback/route";
import { GET as statusGET } from "@/app/api/payments/[id]/route";

const cfg: QPayConfig = { baseUrl: "https://merchant-sandbox.qpay.mn", username: "TEST_MERCHANT", password: "123456", invoiceCode: "TEST_INVOICE" };
const env = () => { vi.stubEnv("QPAY_BASE_URL", cfg.baseUrl); vi.stubEnv("QPAY_USERNAME", cfg.username); vi.stubEnv("QPAY_PASSWORD", cfg.password); vi.stubEnv("QPAY_INVOICE_CODE", cfg.invoiceCode); };
const cb = (id: string, body: unknown = {}) => new Request(`https://site.mn/api/payments/qpay/callback?id=${id}`, { method: "POST", body: JSON.stringify(body) });

beforeEach(async () => { await resetDb(); clearTokenCache(); session = null; env(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("QPay callback", () => {
  it("never believes the body: a callback claiming payment opens nothing until QPay's own check agrees", async () => {
    const q = fakeQPay();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", new Date(), cfg, "https://site.mn");
    const res = await callbackPOST(cb(p.id, { payment_status: "PAID", payment_amount: 50000 }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("SUCCESS");
    expect(q.checks()).toBe(1);
    const st = (await (await (session = u, statusGET(new Request("https://site.mn"), { params: Promise.resolve({ id: p.id }) }))).json()) as { status: string };
    expect(st.status).toBe("PENDING");
  });

  it("opens access when QPay confirms, by GET as well as POST", async () => {
    const q = fakeQPay();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", new Date(), cfg, "https://site.mn");
    q.setPaid([{ id: "pay-1", amount: 50000 }]);
    await callbackGET(new Request(`https://site.mn/api/payments/qpay/callback?id=${p.id}`));
    session = u;
    const st = (await (await statusGET(new Request("https://site.mn"), { params: Promise.resolve({ id: p.id }) })).json()) as { status: string; accessUntil: string };
    expect(st.status).toBe("PAID");
    expect(new Date(st.accessUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it("an unknown id answers 200 and asks QPay nothing", async () => {
    const q = fakeQPay();
    expect((await callbackPOST(cb("does-not-exist"))).status).toBe(200);
    expect(q.checks()).toBe(0);
  });
});

describe("payment status for the payment page", () => {
  it("is 401 signed out and 404 for someone else's payment, without asking QPay", async () => {
    const q = fakeQPay();
    const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn");
    const p = await startPayment(a.id, "PLUS", new Date(), cfg, "https://site.mn");
    const before = q.checks();
    expect((await statusGET(new Request("https://site.mn"), { params: Promise.resolve({ id: p.id }) })).status).toBe(401);
    session = b;
    expect((await statusGET(new Request("https://site.mn"), { params: Promise.resolve({ id: p.id }) })).status).toBe(404);
    expect(q.checks()).toBe(before);
  });
});
