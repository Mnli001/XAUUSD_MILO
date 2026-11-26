import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";
import { fakeWire } from "../helpers/wireFetch";
import { startPayment } from "@/lib/payments";
import type { WireConfig } from "@/lib/wire";
import type { User } from "@/lib/db/schema";

let session: User | null = null;
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session, requireUser: async () => session }));
const redirectTo = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirectTo(u) }));
import { POST as webhook } from "@/app/api/payments/wire/webhook/route";
import { GET as statusGET } from "@/app/api/payments/[id]/route";
import { choosePlanAction } from "@/lib/actions/payments";

const SECRET = "whsec_test";
const cfg: WireConfig = { baseUrl: "https://api.wire.mn", apiKey: "sk_live_test", webhookSecret: SECRET };
const env = (o: { secret?: boolean } = {}) => {
  vi.stubEnv("WIRE_API_KEY", cfg.apiKey);
  vi.stubEnv("WIRE_WEBHOOK_SECRET", o.secret === false ? "" : SECRET);
  vi.stubEnv("APP_URL", "https://site.mn");
};
const signed = (event: unknown, secret = SECRET, t = Math.floor(Date.now() / 1000)) => {
  const body = JSON.stringify(event);
  const sig = `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
  return new Request("https://site.mn/api/payments/wire/webhook", { method: "POST", body, headers: { "content-type": "application/json", "WirePayment-Signature": sig } });
};
const succeeded = (pi: string) => ({ id: "evt_1", object: "event", type: "payment_intent.succeeded", data: { id: pi, object: "payment_intent", status: "succeeded", amount: 50000, currency: "MNT" } });
const status = async (u: User, id: string) => { session = u; return (await (await statusGET(new Request("https://site.mn"), { params: Promise.resolve({ id }) })).json()) as { status: string; accessUntil: string | null }; };

beforeEach(async () => { await resetDb(); session = null; redirectTo.mockClear(); env(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Wire webhook", () => {
  it("opens access on a signed payment_intent.succeeded, after asking Wire itself", async () => {
    const w = fakeWire();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", new Date(), cfg, "https://site.mn");
    w.pay();
    const before = w.retrieves();
    const res = await webhook(signed(succeeded("pi_1")));
    expect(res.status).toBe(200);
    expect(w.retrieves()).toBe(before + 1);
    expect((await status(u, p.id)).status).toBe("PAID");
  });

  it("a signed event claiming payment opens nothing while Wire's own record says unpaid", async () => {
    const w = fakeWire();
    const u = await makeUser("a@x.mn");
    const p = await startPayment(u.id, "PLUS", new Date(), cfg, "https://site.mn");
    expect((await webhook(signed(succeeded("pi_1")))).status).toBe(200);
    expect((await status(u, p.id)).status).toBe("PENDING");
    expect(w.retrieves()).toBeGreaterThan(0);
  });

  it("rejects a bad signature with 400 and asks Wire nothing", async () => {
    const w = fakeWire();
    const u = await makeUser("a@x.mn");
    await startPayment(u.id, "PLUS", new Date(), cfg, "https://site.mn");
    w.pay();
    expect((await webhook(signed(succeeded("pi_1"), "whsec_wrong"))).status).toBe(400);
    const unsigned = new Request("https://site.mn/api/payments/wire/webhook", { method: "POST", body: JSON.stringify(succeeded("pi_1")) });
    expect((await webhook(unsigned)).status).toBe(400);
    expect(w.retrieves()).toBe(0);
  });

  it("answers Wire's endpoint verification ping and events for intents that are not ours with 200", async () => {
    const w = fakeWire();
    expect((await webhook(signed({ id: "evt_v", object: "event", type: "endpoint.verification", data: {} }))).status).toBe(200);
    expect((await webhook(signed(succeeded("pi_unknown")))).status).toBe(200);
    expect(w.retrieves()).toBe(0);
  });

  it("answers 503 until the webhook secret is set, so Wire tries again later", async () => {
    fakeWire();
    vi.unstubAllEnvs();
    env({ secret: false });
    expect((await webhook(signed(succeeded("pi_1")))).status).toBe(503);
  });

  it("answers 500 when Wire cannot be asked, so the delivery is retried", async () => {
    const w = fakeWire();
    const u = await makeUser("a@x.mn");
    await startPayment(u.id, "PLUS", new Date(), cfg, "https://site.mn");
    w.fail(502);
    expect((await webhook(signed(succeeded("pi_1")))).status).toBe(500);
  });
});

describe("payment status for the payment page", () => {
  it("is 401 signed out and 404 for someone else's payment, without asking Wire", async () => {
    const w = fakeWire();
    const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn");
    const p = await startPayment(a.id, "PLUS", new Date(), cfg, "https://site.mn");
    expect((await statusGET(new Request("https://site.mn"), { params: Promise.resolve({ id: p.id }) })).status).toBe(401);
    session = b;
    expect((await statusGET(new Request("https://site.mn"), { params: Promise.resolve({ id: p.id }) })).status).toBe(404);
    expect(w.retrieves()).toBe(0);
  });
});

describe("choosing a plan", () => {
  const form = (plan: string) => { const f = new FormData(); f.set("plan", plan); return f; };

  it("sends the buyer straight to Wire's hosted checkout", async () => {
    fakeWire();
    session = await makeUser("a@x.mn");
    await expect(choosePlanAction(form("PRO"))).rejects.toThrow("REDIRECT:https://pay.wire.mn/c/cs_1");
  });

  it("goes back to the plans page with a note when payments are not set up, or Wire refuses", async () => {
    session = await makeUser("a@x.mn");
    vi.unstubAllEnvs();
    await expect(choosePlanAction(form("PLUS"))).rejects.toThrow("REDIRECT:/plans?pay=off");
    env();
    const w = fakeWire();
    w.fail(403, "connector_required");
    await expect(choosePlanAction(form("PLUS"))).rejects.toThrow("REDIRECT:/plans?pay=error");
  });

  it("ignores an unknown plan", async () => {
    session = await makeUser("a@x.mn");
    await expect(choosePlanAction(form("GOLD"))).rejects.toThrow("REDIRECT:/plans");
  });
});
