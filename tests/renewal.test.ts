import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { emitRenewalReminders, REMIND_DAYS } from "@/lib/renewal";
import { telegramTiming } from "@/lib/telegram";

const DAY = 864e5;
const now = new Date("2026-11-26T10:00:00Z");
let sent: { chat: string; text: string }[];
const send = async (chat: string, text: string) => { sent.push({ chat, text }); return true; };
const realSleep = telegramTiming.sleep;

async function member(email: string, o: { endsIn?: number | null; chat?: string | null; role?: "USER" | "ADMIN"; paused?: boolean; locale?: string } = {}) {
  const u = await makeUser(email, o.role ?? "USER");
  await db.update(schema.users).set({
    accessUntil: o.endsIn === null ? null : new Date(now.getTime() + (o.endsIn ?? 2.5) * DAY),
    telegramChatId: o.chat === undefined ? `chat-${email}` : o.chat,
    signalsPaused: o.paused ?? false,
    locale: o.locale ?? "mn",
  }).where(eq(schema.users.id, u.id));
  return u;
}

beforeEach(async () => { telegramTiming.sleep = async () => {}; await resetDb(); sent = []; vi.stubEnv("APP_URL", "https://site.mn"); });
afterEach(() => { telegramTiming.sleep = realSleep; vi.unstubAllEnvs(); });

describe("emitRenewalReminders", () => {
  it(`reminds a linked member whose plan ends within ${REMIND_DAYS} days, once, with the days left and the plans link`, async () => {
    await member("a@x.mn", { endsIn: 2.5 });
    expect(await emitRenewalReminders(now, { send })).toBe(1);
    expect(sent[0].chat).toBe("chat-a@x.mn");
    expect(sent[0].text).toMatch(/3 хоногийн дараа/);
    expect(sent[0].text).toContain('href="https://site.mn/plans"');
    expect(await emitRenewalReminders(new Date(now.getTime() + 3600e3), { send })).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("reminds again for the next end after a renewal", async () => {
    const u = await member("a@x.mn", { endsIn: 2 });
    await emitRenewalReminders(now, { send });
    // renewed for 30 days; 28 days later the new end is near
    await db.update(schema.users).set({ accessUntil: new Date(now.getTime() + 32 * DAY) }).where(eq(schema.users.id, u.id));
    expect(await emitRenewalReminders(new Date(now.getTime() + 30 * DAY), { send })).toBe(1);
  });

  it("leaves out plans further off, already ended, admins, unlinked or paused accounts", async () => {
    await member("far@x.mn", { endsIn: 10 });
    await member("over@x.mn", { endsIn: -1 });
    await member("adm@x.mn", { role: "ADMIN" });
    await member("nochat@x.mn", { chat: null });
    await member("paused@x.mn", { paused: true });
    await member("none@x.mn", { endsIn: null });
    expect(await emitRenewalReminders(now, { send })).toBe(0);
    expect(sent).toEqual([]);
  });

  it("speaks the member's language", async () => {
    await member("en@x.mn", { endsIn: 1.2, locale: "en" });
    await emitRenewalReminders(now, { send });
    expect(sent[0].text).toMatch(/ends in 2 days/);
  });

  it("a failed send is tried again on the next run", async () => {
    await member("a@x.mn");
    const failing = async () => { throw new Error("telegram down"); };
    expect(await emitRenewalReminders(now, { send: failing })).toBe(0);
    expect(await emitRenewalReminders(now, { send })).toBe(1);
  });
});
