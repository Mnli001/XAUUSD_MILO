import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Wire (wire.mn) payment API v1: one gateway over QPay, cards, Toki, MonPay and the rest.
 * We create a PaymentIntent, send the buyer to Wire's hosted checkout, and only believe "paid" when
 * GET /v1/payment_intents/{id} says `succeeded` — the signed webhook only tells us when to ask.
 * Amounts are whole tögrög. Docs: docs.wire.mn.
 */
export type WireConfig = { baseUrl: string; apiKey: string; webhookSecret: string | null };
export type WireIntent = { id: string; status: string; amount: number; currency: string };
export type WireEvent = { id: string; type: string; data?: { id?: string; object?: string; status?: string; amount?: number; payment_intent?: string } };

export const SIGNATURE_HEADER = "WirePayment-Signature";
const PRODUCTION = "https://api.wire.mn";
const TIMEOUT_MS = 15_000;
const TOLERANCE_S = 300;

export class WireError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | null) {
    super(message);
    this.name = "WireError";
  }
}

/** The project's settings, or null until the owner has entered the API key. */
export function wireConfig(env: Record<string, string | undefined>): WireConfig | null {
  const apiKey = env.WIRE_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    baseUrl: (env.WIRE_BASE_URL?.trim() || PRODUCTION).replace(/\/+$/, ""),
    apiKey,
    webhookSecret: env.WIRE_WEBHOOK_SECRET?.trim() || null,
  };
}

async function request<T>(cfg: WireConfig, method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${cfg.apiKey}`, accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (e) {
    throw new WireError(`Wire ${method} ${path} could not be reached: ${(e as Error).message}`, 0, null);
  }
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : {}; } catch { /* handled below */ }
  if (!res.ok || json === null) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new WireError(`Wire ${method} ${path} failed: ${res.status} ${err?.code ?? ""} ${(err?.message ?? text).slice(0, 200)}`.trim(), res.status, err?.code ?? null);
  }
  return json as T;
}

const intentOf = (b: { id: string; status: string; amount: number; currency?: string }): WireIntent => ({ id: String(b.id), status: String(b.status), amount: Number(b.amount) || 0, currency: String(b.currency ?? "MNT") });

export async function createIntent(cfg: WireConfig, i: { amount: number; description: string; expiresAt: Date; metadata: Record<string, string>; idempotencyKey: string }): Promise<WireIntent> {
  const b = await request<{ id: string; status: string; amount: number; currency?: string }>(cfg, "POST", "/v1/payment_intents", {
    amount: i.amount, currency: "MNT", description: i.description, expires_at: Math.floor(i.expiresAt.getTime() / 1000), metadata: i.metadata,
  }, i.idempotencyKey);
  return intentOf(b);
}

/** A hosted checkout (QR, bank apps, every channel switched on for the project) for an intent still awaiting payment. */
export async function createCheckout(cfg: WireConfig, c: { paymentIntent: string; successUrl: string; cancelUrl: string; idempotencyKey: string }): Promise<{ id: string; url: string }> {
  const b = await request<{ id: string; url: string }>(cfg, "POST", "/v1/checkout/sessions", { payment_intent: c.paymentIntent, success_url: c.successUrl, cancel_url: c.cancelUrl }, c.idempotencyKey);
  if (typeof b.url !== "string" || !/^https:\/\//i.test(b.url)) throw new WireError("Wire checkout returned no https address", 502, null);
  return { id: String(b.id), url: b.url };
}

export async function retrieveIntent(cfg: WireConfig, id: string): Promise<WireIntent> {
  return intentOf(await request(cfg, "GET", `/v1/payment_intents/${encodeURIComponent(id)}`));
}

export async function cancelIntent(cfg: WireConfig, id: string, idempotencyKey: string): Promise<void> {
  await request(cfg, "POST", `/v1/payment_intents/${encodeURIComponent(id)}/cancel`, {}, idempotencyKey);
}

/**
 * Checks `WirePayment-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>` against the raw body,
 * rejects anything signed more than five minutes from now, and returns the parsed event — or null.
 */
export function verifyWebhook(rawBody: string, header: string | null, secret: string, nowSec: number, toleranceSec = TOLERANCE_S): WireEvent | null {
  if (!header) return null;
  let t: number | null = null, v1: string | null = null;
  for (const part of header.split(",")) {
    const [k, ...rest] = part.trim().split("=");
    const val = rest.join("=");
    if (k === "t") t = /^\d+$/.test(val) ? Number(val) : null;
    else if (k === "v1") v1 = val;
  }
  if (t === null || !v1 || !/^[0-9a-f]+$/i.test(v1)) return null;
  if (Math.abs(nowSec - t) > toleranceSec) return null;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(v1.toLowerCase());
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const ev = JSON.parse(rawBody) as WireEvent;
    return ev && typeof ev === "object" && typeof ev.type === "string" ? ev : null;
  } catch {
    return null;
  }
}
