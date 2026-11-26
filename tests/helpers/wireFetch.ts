import { vi } from "vitest";

export type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
type Intent = { id: string; amount: number; currency: string; status: string; expires_at: number | null };

/**
 * A stand-in for the Wire API (api.wire.mn/v1): answers by path, records every request.
 * `pay(amount?)` makes the last intent succeed; `setStatus` sets any status; `fail` makes every call answer an error.
 */
export function fakeWire(o: { checkoutUrl?: string } = {}) {
  const calls: Call[] = [];
  const intents = new Map<string, Intent>();
  let n = 0;
  let failWith: { status: number; code: string } | null = null;
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const method = init.method ?? "GET";
    calls.push({ url, method, headers, body });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (failWith) return json({ error: { type: "api_error", code: failWith.code, message: "nope", request_id: "req_1" } }, failWith.status);
    const path = new URL(url).pathname;
    if (path === "/v1/payment_intents" && method === "POST") {
      const b = body as { amount: number; currency?: string; expires_at?: number };
      const pi: Intent = { id: `pi_${++n}`, amount: b.amount, currency: b.currency ?? "MNT", status: "requires_payment_method", expires_at: b.expires_at ?? null };
      intents.set(pi.id, pi);
      return json({ object: "payment_intent", ...pi, client_secret: "cs_secret", next_action: null, livemode: true, created: 1 });
    }
    if (path === "/v1/checkout/sessions" && method === "POST") {
      const b = body as { payment_intent: string };
      return json({ id: `cs_${n}`, object: "checkout_session", payment_intent: b.payment_intent, status: "open", url: o.checkoutUrl ?? `https://pay.wire.mn/c/cs_${n}` });
    }
    const m = path.match(/^\/v1\/payment_intents\/([^/]+)(\/cancel)?$/);
    if (m) {
      const pi = intents.get(decodeURIComponent(m[1]));
      if (!pi) return json({ error: { type: "invalid_request_error", code: "resource_missing", message: "no such intent" } }, 404);
      if (m[2] && method === "POST") pi.status = "canceled";
      return json({ object: "payment_intent", ...pi });
    }
    return json({ error: { type: "invalid_request_error", code: "not_found", message: "no route" } }, 404);
  });
  const last = () => [...intents.values()].at(-1)!;
  return {
    calls,
    intents,
    pay: (id?: string, amount?: number) => { const pi = id ? intents.get(id)! : last(); pi.status = "succeeded"; if (amount !== undefined) pi.amount = amount; },
    setStatus: (status: string, id?: string) => { (id ? intents.get(id)! : last()).status = status; },
    fail: (status: number, code = "api_error") => { failWith = { status, code }; },
    retrieves: () => calls.filter((c) => c.method === "GET" && /\/v1\/payment_intents\/[^/]+$/.test(new URL(c.url).pathname)).length,
  };
}
