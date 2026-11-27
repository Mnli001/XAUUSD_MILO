import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { MAX_ACTIVE_ALERTS, checkPriceAlerts, createPriceAlert, deletePriceAlert, listPriceAlerts, alertText } from "@/lib/priceAlerts";
import type { PushMessage } from "@/lib/push";
import { viewer } from "@/lib/viewer";

const now = new Date("2026-11-27T03:00:00Z");
const later = (min: number) => new Date(now.getTime() + min * 6e4);
let sent: { chat: string; html: string }[];
let pushed: { userId: string; msg: PushMessage }[];
const deps = {
  send: async (chat: string, html: string) => { sent.push({ chat, html }); return true; },
  push: async (userId: string, msg: PushMessage) => { pushed.push({ userId, msg }); return 1; },
};
const paidUser = async (email: string, chat: string | null = null) => {
  const u = await makeUser(email);
  await db.execute(sql`UPDATE users SET access_until = '2027-01-01', telegram_chat_id = ${chat} WHERE id = ${u.id}`);
  return u;
};

beforeEach(async () => { await resetDb(); sent = []; pushed = []; });

describe("setting an alert", () => {
  it("takes its direction from where the price is now", async () => {
    const u = await paidUser("a@x.mn");
    const up = await createPriceAlert(u.id, 3620, 3598.4, now);
    const down = await createPriceAlert(u.id, 3550, 3598.4, now);
    expect(up.alert?.direction).toBe("above");
    expect(down.alert?.direction).toBe("below");
  });
  it("refuses a level that is not a sensible gold price or is the price itself", async () => {
    const u = await paidUser("a@x.mn");
    for (const level of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 3598.4, 9000, 1000]) expect((await createPriceAlert(u.id, level, 3598.4, now)).error).toBe("level");
    expect((await createPriceAlert(u.id, 3620, null, now)).error).toBe("price");
  });
  it(`keeps at most ${MAX_ACTIVE_ALERTS} waiting alerts per user`, async () => {
    const u = await paidUser("a@x.mn");
    for (let i = 1; i <= MAX_ACTIVE_ALERTS; i++) expect((await createPriceAlert(u.id, 3600 + i, 3598.4, now)).error).toBeUndefined();
    expect((await createPriceAlert(u.id, 3700, 3598.4, now)).error).toBe("limit");
  });
  it("deletes only the owner's alert", async () => {
    const a = await paidUser("a@x.mn"), b = await paidUser("b@x.mn");
    const { alert } = await createPriceAlert(a.id, 3620, 3598.4, now);
    await deletePriceAlert(b.id, alert!.id);
    expect(await listPriceAlerts(a.id)).toHaveLength(1);
    await deletePriceAlert(a.id, alert!.id);
    expect(await listPriceAlerts(a.id)).toHaveLength(0);
  });
});

describe("firing", () => {
  it("fires once when the price reaches the level, by Telegram and push", async () => {
    const u = await paidUser("a@x.mn", "111");
    await createPriceAlert(u.id, 3620, 3598.4, now);
    expect(await checkPriceAlerts({ high: 3610, low: 3605, price: 3608, at: later(1) }, deps)).toBe(0);
    expect(await checkPriceAlerts({ high: 3621, low: 3612, price: 3620.6, at: later(2) }, deps)).toBe(1);
    expect(await checkPriceAlerts({ high: 3630, low: 3622, price: 3625, at: later(3) }, deps)).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].chat).toBe("111");
    expect(sent[0].html).toContain("3620.00");
    expect(pushed).toHaveLength(1);
    expect(pushed[0].msg.title).toContain("3620.00");
    expect(pushed[0].msg.url).toBe("/today#alerts");
    const [row] = await listPriceAlerts(u.id);
    expect(row.triggeredAt?.toISOString()).toBe(later(2).toISOString());
    expect(row.triggeredPrice).toBe(3620.6);
  });
  it("a level below the price fires when price falls to it", async () => {
    const u = await paidUser("a@x.mn");
    await createPriceAlert(u.id, 3580, 3598.4, now);
    expect(await checkPriceAlerts({ high: 3600, low: 3581, price: 3585, at: later(1) }, deps)).toBe(0);
    expect(await checkPriceAlerts({ high: 3590, low: 3579.5, price: 3580, at: later(2) }, deps)).toBe(1);
  });
  it("ignores a price range from before the alert was set", async () => {
    const u = await paidUser("a@x.mn");
    await createPriceAlert(u.id, 3620, 3598.4, now);
    // a 15-minute bar that started before the alert existed already went above the level
    expect(await checkPriceAlerts({ high: 3625, low: 3590, price: 3600, at: later(10), from: new Date(now.getTime() - 5 * 6e4) }, deps)).toBe(0);
    expect(await checkPriceAlerts({ high: 3625, low: 3590, price: 3600, at: later(20), from: later(5) }, deps)).toBe(1);
  });
  it("stays quiet for someone whose plan has ended, and keeps the alert for when they renew", async () => {
    const u = await paidUser("a@x.mn", "111");
    await createPriceAlert(u.id, 3620, 3598.4, now);
    await db.execute(sql`UPDATE users SET access_until = '2020-01-01' WHERE id = ${u.id}`);
    expect(await checkPriceAlerts({ high: 3625, low: 3615, price: 3622, at: later(1) }, deps)).toBe(0);
    expect(sent).toHaveLength(0);
    expect((await listPriceAlerts(u.id))[0].triggeredAt).toBeNull();
  });
  it("the message reads in the user's language and clock", () => {
    const html = alertText({ level: 3620, direction: "above", createdAt: now }, 3620.6, later(2), viewer({ locale: "en", timeZone: "Europe/London" }));
    for (const part of ["XAUUSD reached 3620.00", "3620.60", "03:00"]) expect(html).toContain(part);
    expect(html).not.toMatch(/[Ѐ-ӿ]/);
  });
});

it("a deleted user's alerts go with them", async () => {
  const u = await paidUser("a@x.mn");
  await createPriceAlert(u.id, 3620, 3598.4, now);
  await db.delete(schema.users).where(sql`id = ${u.id}`);
  expect(await db.select().from(schema.priceAlerts)).toHaveLength(0);
});
