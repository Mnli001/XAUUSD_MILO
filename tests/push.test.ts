import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { pushTransport, removePushSubscription, savePushSubscription, sendPush, vapidPublicKey, type PushMessage } from "@/lib/push";

const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/abc${n}`, keys: { p256dh: `BKey${n}`, auth: `auth${n}` } });
const msg: PushMessage = { title: "XAUUSD 3,620", body: "Your alert", url: "/today", tag: "alert" };

describe("push subscriptions", () => {
  beforeEach(resetDb);

  it("keeps one row per endpoint and moves it to whoever subscribed last", async () => {
    const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn");
    expect(await savePushSubscription(a.id, sub(1))).toEqual({});
    expect(await savePushSubscription(a.id, sub(1))).toEqual({});
    expect(await savePushSubscription(b.id, sub(1))).toEqual({});
    const rows = await db.select().from(schema.pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(b.id);
  });

  it("refuses anything that is not an https push endpoint with its keys", async () => {
    const a = await makeUser("a@x.mn");
    expect((await savePushSubscription(a.id, { endpoint: "http://evil.test/x", keys: { p256dh: "k", auth: "a" } })).error).toBe("invalid");
    expect((await savePushSubscription(a.id, { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "", auth: "a" } })).error).toBe("invalid");
    expect((await savePushSubscription(a.id, { endpoint: `https://fcm.googleapis.com/${"x".repeat(2000)}`, keys: { p256dh: "k", auth: "a" } })).error).toBe("invalid");
    expect((await savePushSubscription(a.id, null)).error).toBe("invalid");
    expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(0);
  });

  it("accepts only the browsers' push services", async () => {
    const a = await makeUser("a@x.mn");
    const keys = { p256dh: "k", auth: "a" };
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/x",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
      "https://web.push.apple.com/QH-x",
      "https://api.push.apple.com/3/device/x",
    ]) expect(await savePushSubscription(a.id, { endpoint, keys })).toEqual({});
    for (const endpoint of [
      "https://evil.test/x",
      "https://fcm.googleapis.com.evil.test/x",
      "https://evilfcm.googleapis.com/x",
      "https://notify.windows.com/x",
      "https://push.apple.com.evil.test/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://127.0.0.1/x",
      "not a url",
    ]) expect((await savePushSubscription(a.id, { endpoint, keys })).error).toBe("invalid");
  });

  it("keeps at most five devices per user, replacing the oldest", async () => {
    const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn");
    await savePushSubscription(b.id, sub(99));
    for (let n = 1; n <= 7; n++) expect(await savePushSubscription(a.id, sub(n))).toEqual({});
    const mine = (await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, a.id))).map((r) => r.endpoint).sort();
    expect(mine).toEqual([3, 4, 5, 6, 7].map((n) => sub(n).endpoint).sort());
    // saving one again makes it the newest, so the next new device replaces another
    await savePushSubscription(a.id, sub(3));
    await savePushSubscription(a.id, sub(8));
    const after = (await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, a.id))).map((r) => r.endpoint).sort();
    expect(after).toEqual([3, 5, 6, 7, 8].map((n) => sub(n).endpoint).sort());
    expect(await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, b.id))).toHaveLength(1);
  });

  it("removes only the caller's own subscription", async () => {
    const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn");
    await savePushSubscription(a.id, sub(1));
    await removePushSubscription(b.id, sub(1).endpoint);
    expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(1);
    await removePushSubscription(a.id, sub(1).endpoint);
    expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(0);
  });
});

describe("sending", () => {
  beforeEach(resetDb);

  it("sends the message to every device of the user and drops devices the push service says are gone", async () => {
    const a = await makeUser("a@x.mn");
    await savePushSubscription(a.id, sub(1));
    await savePushSubscription(a.id, sub(2));
    const seen: { endpoint: string; payload: unknown }[] = [];
    const original = pushTransport.send;
    pushTransport.send = async (s, payload) => {
      seen.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
      if (s.endpoint.endsWith("abc2")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    };
    try {
      expect(await sendPush(a.id, msg)).toBe(1);
    } finally {
      pushTransport.send = original;
    }
    expect(seen.map((s) => s.endpoint).sort()).toEqual([sub(1).endpoint, sub(2).endpoint]);
    expect(seen[0].payload).toEqual(msg);
    const left = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, a.id));
    expect(left.map((r) => r.endpoint)).toEqual([sub(1).endpoint]);
  });

  it("keeps a device after a temporary failure", async () => {
    const a = await makeUser("a@x.mn");
    await savePushSubscription(a.id, sub(1));
    const original = pushTransport.send;
    pushTransport.send = async () => { throw Object.assign(new Error("busy"), { statusCode: 503 }); };
    try {
      expect(await sendPush(a.id, msg)).toBe(0);
    } finally {
      pushTransport.send = original;
    }
    expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(1);
  });
});

describe("server keys", () => {
  it("are made once and then reused", async () => {
    await db.execute(sql`DELETE FROM app_state WHERE key = 'push:vapid'`);
    const first = await vapidPublicKey();
    expect(first).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(await vapidPublicKey()).toBe(first);
  });
});
