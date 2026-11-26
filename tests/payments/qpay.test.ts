import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { qpayConfig, createInvoice, checkInvoice, cancelInvoice, clearTokenCache, type QPayConfig } from "@/lib/qpay";
import { fakeQPay } from "../helpers/qpayFetch";

const cfg: QPayConfig = { baseUrl: "https://merchant-sandbox.qpay.mn", username: "TEST_MERCHANT", password: "123456", invoiceCode: "TEST_INVOICE" };
const input = { senderInvoiceNo: "XAU-1", amount: 50000, description: "XAU Analytics · Plus", callbackUrl: "https://site.mn/api/payments/qpay/callback?id=p1" };

beforeEach(() => clearTokenCache());
afterEach(() => vi.unstubAllGlobals());

describe("qpayConfig", () => {
  it("is null until all three credentials are set", () => {
    expect(qpayConfig({})).toBeNull();
    expect(qpayConfig({ QPAY_USERNAME: "u", QPAY_PASSWORD: "p" })).toBeNull();
  });
  it("defaults to production and trims a trailing slash", () => {
    expect(qpayConfig({ QPAY_USERNAME: "u", QPAY_PASSWORD: "p", QPAY_INVOICE_CODE: "c" })?.baseUrl).toBe("https://merchant.qpay.mn");
    expect(qpayConfig({ QPAY_BASE_URL: "https://merchant-sandbox.qpay.mn/", QPAY_USERNAME: "u", QPAY_PASSWORD: "p", QPAY_INVOICE_CODE: "c" })?.baseUrl).toBe("https://merchant-sandbox.qpay.mn");
  });
});

describe("createInvoice", () => {
  it("signs in with Basic auth, then sends the invoice with a bearer token", async () => {
    const q = fakeQPay();
    const inv = await createInvoice(cfg, input);
    expect(q.calls[0].url).toBe("https://merchant-sandbox.qpay.mn/v2/auth/token");
    expect(q.calls[0].headers.authorization).toBe(`Basic ${Buffer.from("TEST_MERCHANT:123456").toString("base64")}`);
    expect(q.calls[1].headers.authorization).toBe("Bearer tok1");
    expect(q.calls[1].body).toEqual({ invoice_code: "TEST_INVOICE", sender_invoice_no: "XAU-1", invoice_receiver_code: "terminal", invoice_description: "XAU Analytics · Plus", amount: 50000, callback_url: input.callbackUrl });
    expect(inv).toMatchObject({ invoiceId: "inv-1", qrText: "QRTEXT", qrImage: "iVBORw0KGgo=", shortUrl: "https://s.qpay.mn/x" });
    expect(inv.urls[0]).toMatchObject({ name: "Khan bank", link: "khanbank://q?qPay_QRcode=QRTEXT" });
  });

  it("reuses the token while it is valid (sandbox gives expires_in as a unix time)", async () => {
    const q = fakeQPay({ expiresIn: Math.floor(Date.now() / 1000) + 3600 });
    await createInvoice(cfg, input);
    await createInvoice(cfg, input);
    expect(q.calls.filter((c) => c.url.endsWith("/auth/token"))).toHaveLength(1);
  });

  it("reads expires_in given as seconds too, and signs in again when it is about to run out", async () => {
    const q = fakeQPay({ expiresIn: 30 }); // 30 seconds: inside the safety margin, so every call signs in
    await createInvoice(cfg, input);
    await createInvoice(cfg, input);
    expect(q.calls.filter((c) => c.url.endsWith("/auth/token"))).toHaveLength(2);
  });

  it("drops a bank link that could run script", async () => {
    fakeQPay({ urls: [{ name: "Bad", description: "", logo: "", link: "javascript:alert(1)" }, { name: "Good", description: "", logo: "", link: "golomtbank://q?x=1" }] });
    const inv = await createInvoice(cfg, input);
    expect(inv.urls.map((u) => u.name)).toEqual(["Good"]);
  });
});

describe("checkInvoice", () => {
  it("asks QPay about the invoice and adds up only the paid rows", async () => {
    const q = fakeQPay({ paid: [{ id: "pay-1", amount: 30000 }, { id: "pay-2", amount: 20000 }, { id: "pay-3", amount: 99999, status: "FAILED" }] });
    const r = await checkInvoice(cfg, "inv-9");
    const call = q.calls.find((c) => c.url.endsWith("/v2/payment/check"))!;
    expect(call.body).toMatchObject({ object_type: "INVOICE", object_id: "inv-9" });
    expect(r).toEqual({ paidAmount: 50000, paymentId: "pay-1" });
  });
  it("is zero with no payment", async () => {
    fakeQPay();
    expect(await checkInvoice(cfg, "inv-9")).toEqual({ paidAmount: 0, paymentId: null });
  });
});

describe("cancelInvoice", () => {
  it("deletes the invoice at QPay", async () => {
    const q = fakeQPay();
    await cancelInvoice(cfg, "inv-7");
    expect(q.calls.at(-1)).toMatchObject({ url: "https://merchant-sandbox.qpay.mn/v2/invoice/inv-7", method: "DELETE" });
  });
});
