/**
 * QPay merchant API v2: sign in, create an invoice, ask whether it has been paid, cancel it.
 * QPay does not sign its callbacks, so whether an invoice is paid is only ever decided by asking here.
 */
export type QPayConfig = { baseUrl: string; username: string; password: string; invoiceCode: string };
export type BankLink = { name: string; description: string; logo: string; link: string };
export type QPayInvoice = { invoiceId: string; qrText: string; qrImage: string; shortUrl: string | null; urls: BankLink[] };

const PRODUCTION = "https://merchant.qpay.mn";
const MARGIN_MS = 60_000; // sign in again a minute before the token runs out
const TIMEOUT_MS = 15_000;

/** The merchant settings, or null until the owner has entered all three credentials. */
export function qpayConfig(env: Record<string, string | undefined>): QPayConfig | null {
  const username = env.QPAY_USERNAME?.trim(), password = env.QPAY_PASSWORD?.trim(), invoiceCode = env.QPAY_INVOICE_CODE?.trim();
  if (!username || !password || !invoiceCode) return null;
  return { baseUrl: (env.QPAY_BASE_URL?.trim() || PRODUCTION).replace(/\/+$/, ""), username, password, invoiceCode };
}

let cache: { key: string; token: string; until: number } | null = null;
export const clearTokenCache = () => { cache = null; };

async function call(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
}

async function fail(what: string, res: Response): Promise<never> {
  const text = await res.text().catch(() => "");
  throw new Error(`QPay ${what} failed: ${res.status} ${text.slice(0, 200)}`);
}

async function token(cfg: QPayConfig): Promise<string> {
  const key = `${cfg.baseUrl}|${cfg.username}`;
  if (cache && cache.key === key && cache.until - MARGIN_MS > Date.now()) return cache.token;
  const res = await call(`${cfg.baseUrl}/v2/auth/token`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64")}`, "content-type": "application/json" },
  });
  if (!res.ok) await fail("sign-in", res);
  const b = (await res.json()) as { access_token: string; expires_in: number };
  // The sandbox sends expires_in as a unix time; documented elsewhere as seconds from now. Accept both.
  const e = Number(b.expires_in) || 0;
  const until = e > 1e9 ? e * 1000 : Date.now() + e * 1000;
  cache = { key, token: b.access_token, until };
  return b.access_token;
}

/** A request with the bearer token; one retry with a fresh token if QPay says it expired. */
async function authed(cfg: QPayConfig, path: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await call(`${cfg.baseUrl}${path}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${await token(cfg)}`, "content-type": "application/json" } });
    if (res.status !== 401 || attempt > 0) return res;
    clearTokenCache();
  }
}

const SAFE_LINK = /^(?!\s*(javascript|data|vbscript):)[a-z][a-z0-9+.-]*:/i;

export async function createInvoice(cfg: QPayConfig, i: { senderInvoiceNo: string; amount: number; description: string; callbackUrl: string }): Promise<QPayInvoice> {
  const res = await authed(cfg, "/v2/invoice", {
    method: "POST",
    body: JSON.stringify({ invoice_code: cfg.invoiceCode, sender_invoice_no: i.senderInvoiceNo, invoice_receiver_code: "terminal", invoice_description: i.description, amount: i.amount, callback_url: i.callbackUrl }),
  });
  if (!res.ok) await fail("invoice", res);
  const b = (await res.json()) as { invoice_id: string; qr_text?: string; qr_image?: string; qPay_shortUrl?: string; qpay_short_url?: string; urls?: BankLink[] };
  return {
    invoiceId: b.invoice_id,
    qrText: b.qr_text ?? "",
    qrImage: b.qr_image ?? "",
    shortUrl: b.qPay_shortUrl ?? b.qpay_short_url ?? null,
    urls: (b.urls ?? []).filter((u) => typeof u?.link === "string" && SAFE_LINK.test(u.link)).map(({ name, description, logo, link }) => ({ name: String(name ?? ""), description: String(description ?? ""), logo: String(logo ?? ""), link })),
  };
}

/** How much has been paid on an invoice, counting only rows QPay marks PAID. */
export async function checkInvoice(cfg: QPayConfig, invoiceId: string): Promise<{ paidAmount: number; paymentId: string | null }> {
  const res = await authed(cfg, "/v2/payment/check", {
    method: "POST",
    body: JSON.stringify({ object_type: "INVOICE", object_id: invoiceId, offset: { page_number: 1, page_limit: 100 } }),
  });
  if (!res.ok) await fail("check", res);
  const b = (await res.json()) as { rows?: { payment_id: string; payment_status: string; payment_amount: string | number }[] };
  const paid = (b.rows ?? []).filter((r) => r.payment_status === "PAID");
  return { paidAmount: paid.reduce((s, r) => s + (Number(r.payment_amount) || 0), 0), paymentId: paid[0]?.payment_id ?? null };
}

export async function cancelInvoice(cfg: QPayConfig, invoiceId: string): Promise<void> {
  const res = await authed(cfg, `/v2/invoice/${encodeURIComponent(invoiceId)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) await fail("cancel", res);
}
