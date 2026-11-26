import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";
import { fakeWire } from "../helpers/wireFetch";
import type { User } from "@/lib/db/schema";

let session: User | null = null;
vi.mock("@/lib/auth", () => ({ requireUser: async () => session, getSessionUser: async () => session, requireAdmin: async () => session }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "evil.example", "x-forwarded-host": "evil.example" }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import nextConfig from "../../next.config";
import { isPlanId } from "@/lib/plans";
import { POST as tick } from "@/app/api/feed/tick/route";
import { POST as wireWebhook } from "@/app/api/payments/wire/webhook/route";
import { linkTelegramAction } from "@/lib/actions/telegram";
import { startPayment, refreshPayment } from "@/lib/payments";
import type { WireConfig } from "@/lib/wire";

beforeEach(async () => { await resetDb(); session = null; });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("security headers", () => {
  it("every path gets anti-framing, nosniff, a referrer policy and a permissions policy, and no script CSP", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*")!;
    const h = Object.fromEntries(all.headers.map((x) => [x.key, x.value]));
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).not.toContain("script-src");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBeUndefined(); // back to the 1 MB default
  });
});

describe("isPlanId", () => {
  it("accepts only the plans themselves, not inherited object keys", () => {
    expect(isPlanId("PLUS")).toBe(true);
    for (const v of ["toString", "constructor", "__proto__", "hasOwnProperty", "plus", 1, null]) expect(isPlanId(v)).toBe(false);
  });
});

describe("price feed token", () => {
  const send = (token: string) => tick(new Request("https://site.mn/api/feed/tick", { method: "POST", headers: { "x-bot-token": token, "content-type": "application/json" }, body: JSON.stringify({ symbol: "XAUUSD", bid: 2650.1, ask: 2650.4 }) }));
  it("takes FEED_TOKEN, and no longer CRON_SECRET once FEED_TOKEN is set", async () => {
    vi.stubEnv("FEED_TOKEN", "feed-secret-123");
    vi.stubEnv("CRON_SECRET", "cron-secret-456");
    expect((await send("feed-secret-123")).status).toBe(200);
    expect((await send("cron-secret-456")).status).toBe(403);
    expect((await send("feed-secret-12")).status).toBe(403); // a prefix is not enough
  });
  it("falls back to CRON_SECRET, with a warning, while FEED_TOKEN is unset", async () => {
    vi.stubEnv("FEED_TOKEN", "");
    vi.stubEnv("CRON_SECRET", "cron-secret-456");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await send("cron-secret-456")).status).toBe(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("FEED_TOKEN is not set"));
  });
});

describe("Telegram linking from the site", () => {
  it("never builds a webhook address from request headers and never calls setWebhook", async () => {
    session = await makeUser("a@x.mn");
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => { calls.push(String(url)); return new Response(JSON.stringify({ ok: true, result: { username: "xau_bot" } })); });
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:test");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "");
    const refused = await linkTelegramAction({}, new FormData());
    expect(refused.error).toMatch(/APP_URL/);
    expect(calls).toHaveLength(0);

    vi.stubEnv("APP_URL", "https://xau.example");
    const r = await linkTelegramAction({}, new FormData());
    expect(r.link).toMatch(/^https:\/\/t\.me\/xau_bot\?start=[a-f0-9]{24}$/);
    expect(calls.some((u) => u.includes("setWebhook"))).toBe(false);
  });
});

describe("Wire refund webhook", () => {
  const SECRET = "whsec_test";
  const cfg: WireConfig = { baseUrl: "https://api.wire.mn", apiKey: "sk_live_test", webhookSecret: SECRET };
  const signed = (event: unknown) => {
    const body = JSON.stringify(event);
    const t = Math.floor(Date.now() / 1000);
    const sig = `t=${t},v1=${createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex")}`;
    return new Request("https://site.mn/api/payments/wire/webhook", { method: "POST", body, headers: { "content-type": "application/json", "WirePayment-Signature": sig } });
  };
  it("a signed refund event marks the payment REFUNDED and takes back the access it bought", async () => {
    vi.stubEnv("WIRE_API_KEY", cfg.apiKey);
    vi.stubEnv("WIRE_WEBHOOK_SECRET", SECRET);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = fakeWire();
    const u = await makeUser("a@x.mn");
    const now = new Date();
    const p = await startPayment(u.id, "PLUS", now, cfg, "https://site.mn");
    w.pay();
    await refreshPayment(p.id, now, cfg, { force: true });
    const res = await wireWebhook(signed({ id: "evt_r", type: "refund.succeeded", data: { id: "re_1", object: "refund", payment_intent: p.providerRef, amount: 50000 } }));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(schema.payments).where(eq(schema.payments.id, p.id));
    expect(row.status).toBe("REFUNDED");
    expect(row.adminNote).toMatch(/refund\.succeeded/);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(user.accessUntil!.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
