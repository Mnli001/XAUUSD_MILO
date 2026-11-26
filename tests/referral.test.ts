import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { fakeWire } from "./helpers/wireFetch";
import { referralCodeFor, referralStats, REFERRAL_DAYS } from "@/lib/referral";
import { registerUser } from "@/lib/actions/register";
import { startPayment, refreshPayment } from "@/lib/payments";
import type { WireConfig } from "@/lib/wire";

const DAY = 864e5;
const now = new Date("2026-11-26T10:00:00Z");
const cfg: WireConfig = { baseUrl: "https://api.wire.mn", apiKey: "sk_live_test", webhookSecret: null };
const userBy = async (email: string) => (await db.select().from(schema.users).where(eq(schema.users.email, email)))[0];
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); f.set("consent", "on"); return f; };
let w: ReturnType<typeof fakeWire>;
async function pay(userId: string, plan: "PLUS" | "PRO" = "PLUS", at = now) {
  const p = await startPayment(userId, plan, at, cfg, "https://site.mn");
  w.pay();
  await refreshPayment(p.id, at, cfg, { force: true });
}

beforeEach(async () => { await resetDb(); w = fakeWire(); });
afterEach(() => vi.unstubAllGlobals());

describe("referral codes", () => {
  it("each user has one code, the same every time, different from everyone else's", async () => {
    const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn");
    const ca = await referralCodeFor(a.id);
    expect(ca).toMatch(/^[A-Z0-9]{8}$/);
    expect(await referralCodeFor(a.id)).toBe(ca);
    expect(await referralCodeFor(b.id)).not.toBe(ca);
  });

  it("registering through a code records who invited; an unknown code is ignored", async () => {
    const a = await makeUser("a@x.mn");
    const code = await referralCodeFor(a.id);
    expect(await registerUser(fd({ name: "F", email: "f@x.mn", password: "password1", ref: code.toLowerCase() }))).toEqual({});
    expect((await userBy("f@x.mn")).referredBy).toBe(a.id);
    expect(await registerUser(fd({ name: "G", email: "g@x.mn", password: "password1", ref: "NOPE1234" }))).toEqual({});
    expect((await userBy("g@x.mn")).referredBy).toBeNull();
  });
});

describe("the reward", () => {
  async function invited() {
    const a = await makeUser("a@x.mn");
    await registerUser(fd({ name: "F", email: "f@x.mn", password: "password1", ref: await referralCodeFor(a.id) }));
    return { a, f: await userBy("f@x.mn") };
  }

  it(`the inviter gets ${REFERRAL_DAYS} days when the friend's first payment goes through`, async () => {
    const { a, f } = await invited();
    await pay(f.id);
    expect((await userBy("a@x.mn")).accessUntil!.getTime()).toBe(now.getTime() + REFERRAL_DAYS * DAY);
    expect(await referralStats(a.id)).toEqual({ invited: 1, paid: 1, daysEarned: REFERRAL_DAYS });
  });

  it("only once per friend, however many plans the friend buys", async () => {
    const { f } = await invited();
    await pay(f.id, "PLUS");
    await pay(f.id, "PRO", new Date(now.getTime() + DAY));
    expect((await userBy("a@x.mn")).accessUntil!.getTime()).toBe(now.getTime() + REFERRAL_DAYS * DAY);
  });

  it("days are added to the end of an inviter's running plan", async () => {
    const { a, f } = await invited();
    const end = new Date(now.getTime() + 20 * DAY);
    await db.update(schema.users).set({ accessUntil: end }).where(eq(schema.users.id, a.id));
    await pay(f.id);
    expect((await userBy("a@x.mn")).accessUntil!.getTime()).toBe(end.getTime() + REFERRAL_DAYS * DAY);
  });

  it("a friend who registers but never pays earns nothing", async () => {
    const { a } = await invited();
    expect((await userBy("a@x.mn")).accessUntil).toBeNull();
    expect(await referralStats(a.id)).toEqual({ invited: 1, paid: 0, daysEarned: 0 });
  });
});
