import { vi } from "vitest";

export type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

/**
 * A stand-in for QPay: answers by path, records every request. `token` is what /v2/auth/token returns;
 * `paid` is the list of payment rows /v2/payment/check returns for any invoice.
 */
export function fakeQPay(o: { expiresIn?: number; paid?: { id: string; amount: number; status?: string }[]; invoiceId?: string; urls?: { name: string; description: string; logo: string; link: string }[] } = {}) {
  const calls: Call[] = [];
  let tokenN = 0;
  const state = { paid: o.paid ?? [], expiresIn: o.expiresIn ?? Math.floor(Date.now() / 1000) + 3600 };
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method ?? "GET", headers, body });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    const path = new URL(url).pathname;
    if (path === "/v2/auth/token") return json({ access_token: `tok${++tokenN}`, expires_in: state.expiresIn, token_type: "bearer" });
    if (path === "/v2/invoice" && init.method === "POST") {
      return json({ invoice_id: o.invoiceId ?? "inv-1", qr_text: "QRTEXT", qr_image: "iVBORw0KGgo=", qPay_shortUrl: "https://s.qpay.mn/x", urls: o.urls ?? [{ name: "Khan bank", description: "Хаан банк", logo: "https://qpay.mn/khan.png", link: "khanbank://q?qPay_QRcode=QRTEXT" }] });
    }
    if (path === "/v2/payment/check") {
      const rows = state.paid.map((p) => ({ payment_id: p.id, payment_status: p.status ?? "PAID", payment_amount: String(p.amount), payment_currency: "MNT" }));
      return json({ count: rows.length, paid_amount: rows.filter((r) => r.payment_status === "PAID").reduce((s, r) => s + Number(r.payment_amount), 0), rows });
    }
    if (path.startsWith("/v2/invoice/") && init.method === "DELETE") return json({});
    return json({ error: "NOT_FOUND" }, 404);
  });
  return { calls, setPaid: (p: { id: string; amount: number; status?: string }[]) => { state.paid = p; }, checks: () => calls.filter((c) => c.url.endsWith("/v2/payment/check")).length };
}
