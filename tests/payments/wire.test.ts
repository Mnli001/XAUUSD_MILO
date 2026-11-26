import { describe, it, expect, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { wireConfig, createIntent, createCheckout, retrieveIntent, cancelIntent, verifyWebhook, WireError, type WireConfig } from "@/lib/wire";
import { fakeWire } from "../helpers/wireFetch";

const cfg: WireConfig = { baseUrl: "https://api.wire.mn", apiKey: "sk_live_abc", webhookSecret: "whsec_s" };
afterEach(() => vi.unstubAllGlobals());

const sign = (body: string, t: number, secret = "whsec_s") => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

describe("wireConfig", () => {
  it("is null until the API key is set", () => {
    expect(wireConfig({})).toBeNull();
    expect(wireConfig({ WIRE_API_KEY: "  " })).toBeNull();
  });
  it("defaults to api.wire.mn, trims a trailing slash, and keeps the webhook secret when given", () => {
    expect(wireConfig({ WIRE_API_KEY: "sk_live_x" })).toEqual({ baseUrl: "https://api.wire.mn", apiKey: "sk_live_x", webhookSecret: null });
    expect(wireConfig({ WIRE_API_KEY: "sk_live_x", WIRE_BASE_URL: "https://w.test/", WIRE_WEBHOOK_SECRET: "whsec_1" })).toEqual({ baseUrl: "https://w.test", apiKey: "sk_live_x", webhookSecret: "whsec_1" });
  });
});

describe("createIntent", () => {
  it("posts whole tögrög with the bearer key, an idempotency key, and the deadline in unix seconds", async () => {
    const w = fakeWire();
    const pi = await createIntent(cfg, { amount: 50000, description: "XAU Analytics · Plus", expiresAt: new Date("2026-11-26T10:30:00Z"), metadata: { payment: "p1" }, idempotencyKey: "xau-p1-intent" });
    const c = w.calls[0];
    expect(c.url).toBe("https://api.wire.mn/v1/payment_intents");
    expect(c.method).toBe("POST");
    expect(c.headers.authorization).toBe("Bearer sk_live_abc");
    expect(c.headers["idempotency-key"]).toBe("xau-p1-intent");
    expect(c.headers["content-type"]).toBe("application/json");
    expect(c.body).toEqual({ amount: 50000, currency: "MNT", description: "XAU Analytics · Plus", expires_at: Date.parse("2026-11-26T10:30:00Z") / 1000, metadata: { payment: "p1" } });
    expect(pi).toEqual({ id: "pi_1", status: "requires_payment_method", amount: 50000, currency: "MNT" });
  });

  it("raises a WireError carrying Wire's code and status", async () => {
    const w = fakeWire();
    w.fail(403, "connector_required");
    const e = await createIntent(cfg, { amount: 1, description: "x", expiresAt: new Date(), metadata: {}, idempotencyKey: "k" }).catch((x) => x);
    expect(e).toBeInstanceOf(WireError);
    expect(e).toMatchObject({ status: 403, code: "connector_required" });
    expect(String(e.message)).not.toContain("sk_live_abc");
  });
});

describe("createCheckout", () => {
  it("opens a hosted checkout for the intent and returns its pay.wire.mn address", async () => {
    const w = fakeWire();
    const s = await createCheckout(cfg, { paymentIntent: "pi_1", successUrl: "https://site.mn/pay/p1", cancelUrl: "https://site.mn/plans", idempotencyKey: "xau-p1-checkout" });
    expect(w.calls[0].url).toBe("https://api.wire.mn/v1/checkout/sessions");
    expect(w.calls[0].headers["idempotency-key"]).toBe("xau-p1-checkout");
    expect(w.calls[0].body).toEqual({ payment_intent: "pi_1", success_url: "https://site.mn/pay/p1", cancel_url: "https://site.mn/plans" });
    expect(s.url).toBe("https://pay.wire.mn/c/cs_0");
  });

  it("refuses a checkout address that is not https, since buyers are sent there", async () => {
    fakeWire({ checkoutUrl: "javascript:alert(1)" });
    await expect(createCheckout(cfg, { paymentIntent: "pi_1", successUrl: "https://s", cancelUrl: "https://s", idempotencyKey: "k" })).rejects.toBeInstanceOf(WireError);
  });
});

describe("retrieveIntent and cancelIntent", () => {
  it("reads an intent's status and amount, and cancels it", async () => {
    const w = fakeWire();
    const pi = await createIntent(cfg, { amount: 150000, description: "x", expiresAt: new Date(), metadata: {}, idempotencyKey: "k" });
    w.pay(pi.id);
    expect(await retrieveIntent(cfg, pi.id)).toEqual({ id: pi.id, status: "succeeded", amount: 150000, currency: "MNT" });
    await cancelIntent(cfg, pi.id, "k-cancel");
    const call = w.calls.at(-1)!;
    expect(call.url).toBe(`https://api.wire.mn/v1/payment_intents/${pi.id}/cancel`);
    expect(call.headers["idempotency-key"]).toBe("k-cancel");
  });
  it("escapes the id in the address", async () => {
    const w = fakeWire();
    await retrieveIntent(cfg, "a/b?c").catch(() => {});
    expect(w.calls[0].url).toBe("https://api.wire.mn/v1/payment_intents/a%2Fb%3Fc");
  });
});

describe("verifyWebhook", () => {
  const body = JSON.stringify({ id: "evt_1", object: "event", type: "payment_intent.succeeded", data: { id: "pi_1", status: "succeeded", amount: 50000 } });
  const now = 1_791_774_042;

  it("accepts a correctly signed body and returns the event", () => {
    expect(verifyWebhook(body, sign(body, now), "whsec_s", now)).toMatchObject({ id: "evt_1", type: "payment_intent.succeeded", data: { id: "pi_1" } });
  });
  it("rejects a changed body, a wrong secret, a missing or garbled header", () => {
    expect(verifyWebhook(body + " ", sign(body, now), "whsec_s", now)).toBeNull();
    expect(verifyWebhook(body, sign(body, now, "whsec_other"), "whsec_s", now)).toBeNull();
    expect(verifyWebhook(body, null, "whsec_s", now)).toBeNull();
    expect(verifyWebhook(body, "t=abc,v1=zz", "whsec_s", now)).toBeNull();
    expect(verifyWebhook(body, `t=${now}`, "whsec_s", now)).toBeNull();
  });
  it("rejects a signature older or newer than five minutes (a replay)", () => {
    expect(verifyWebhook(body, sign(body, now - 301), "whsec_s", now)).toBeNull();
    expect(verifyWebhook(body, sign(body, now + 301), "whsec_s", now)).toBeNull();
    expect(verifyWebhook(body, sign(body, now - 299), "whsec_s", now)).not.toBeNull();
  });
  it("rejects a signed body that is not JSON", () => {
    expect(verifyWebhook("not json", sign("not json", now), "whsec_s", now)).toBeNull();
  });
});
